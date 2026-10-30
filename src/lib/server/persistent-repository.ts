import { promises as fs } from "node:fs";
import path from "node:path";
import { calculateMetrics, findShortestPath, getNeighborhood, searchGraph } from "@/lib/graph/engine";
import { loadLeadGraph } from "./lead-corpus";
import type {
  GraphActivity,
  GraphSnapshot,
  KnowledgeLink,
  KnowledgeNode,
  NewLinkInput,
  NewNodeInput,
  NodePatch,
} from "@/lib/graph/types";

const runtimePath =
  process.env.GRAPH_RUNTIME_PATH ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "asp-invest", "runtime-graph.json");
const persistToDisk = process.env.GRAPH_PERSISTENCE !== "memory";

const timestamp = () => new Date().toISOString();
const identifier = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

let memorySnapshot: GraphSnapshot | null = null;
let writeQueue = Promise.resolve();
let diskSignature = "";

async function loadSnapshot(): Promise<GraphSnapshot> {
  const corpus = await loadLeadGraph();
  const combine = (saved: GraphSnapshot): GraphSnapshot => {
    const sourceIds = new Set(corpus.nodes.map((node) => node.id));
    const sourceLinkIds = new Set(corpus.links.map((link) => link.id));
    const tombstones = new Map(saved.nodes.filter((node) => node.deletedAt).map((node) => [node.id, node]));
    return {
      ...corpus,
      generatedAt: saved.generatedAt > corpus.generatedAt ? saved.generatedAt : corpus.generatedAt,
      nodes: [...corpus.nodes.map((node) => tombstones.get(node.id) ?? node), ...saved.nodes.filter((node) => !sourceIds.has(node.id) && !node.id.startsWith("lead-") && !node.id.startsWith("segment-"))],
      links: [...corpus.links.map((link) => tombstones.has(link.source) || tombstones.has(link.target) ? { ...link, deletedAt: tombstones.get(link.source)?.deletedAt ?? tombstones.get(link.target)?.deletedAt } : link), ...saved.links.filter((link) => !sourceLinkIds.has(link.id) && !link.id.startsWith("link-lead-") && !link.id.startsWith("link-segment-"))],
      activities: [...corpus.activities, ...saved.activities.filter((item) => !item.id.startsWith("corpus-"))],
    };
  };
  if (persistToDisk) {
    try {
      const stats = await fs.stat(runtimePath);
      const signature = `${stats.mtimeMs}:${stats.size}`;
      if (memorySnapshot && signature === diskSignature) {
        return combine(structuredClone(memorySnapshot));
      }
      const raw = await fs.readFile(runtimePath, "utf8");
      memorySnapshot = JSON.parse(raw) as GraphSnapshot;
      diskSignature = signature;
      return combine(structuredClone(memorySnapshot));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }

  if (memorySnapshot) return combine(structuredClone(memorySnapshot));
  return corpus;
}

async function saveSnapshot(snapshot: GraphSnapshot) {
  memorySnapshot = structuredClone(snapshot);
  if (!persistToDisk) return;

  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(runtimePath), { recursive: true });
    const temporary = `${runtimePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), "utf8");
    await fs.rename(temporary, runtimePath);
    const stats = await fs.stat(runtimePath);
    diskSignature = `${stats.mtimeMs}:${stats.size}`;
  });
  await writeQueue;
}

function graphActivity(
  action: GraphActivity["action"],
  node: Pick<KnowledgeNode, "id" | "label">,
  detail: string,
  actor: string,
): GraphActivity {
  return {
    id: identifier("activity"),
    action,
    subjectId: node.id,
    subjectLabel: node.label,
    actor,
    timestamp: timestamp(),
    detail,
  };
}

export const graphRepository = {
  async snapshot() {
    return loadSnapshot();
  },

  async search(query: string, limit = 12) {
    return searchGraph(await loadSnapshot(), query, limit);
  },

  async node(id: string) {
    return (await loadSnapshot()).nodes.find((node) => node.id === id) ?? null;
  },

  async neighborhood(id: string, depth = 1) {
    return getNeighborhood(await loadSnapshot(), id, depth);
  },

  async path(sourceId: string, targetId: string) {
    return findShortestPath(await loadSnapshot(), sourceId, targetId);
  },

  async metrics() {
    return calculateMetrics(await loadSnapshot());
  },

  async addNode(input: NewNodeInput, actor = "API client") {
    const snapshot = await loadSnapshot();
    const createdAt = timestamp();
    const node: KnowledgeNode = {
      id: identifier("node"),
      label: input.label.trim(),
      type: input.type,
      description: input.description.trim(),
      status: input.status ?? "review",
      authority: input.authority ?? "agent-generated",
      confidence: input.confidence ?? 0.7,
      tags: input.tags ?? [],
      sources: input.sources ?? [],
      createdAt,
      updatedAt: createdAt,
    };
    snapshot.nodes.push(node);
    snapshot.activities.unshift(
      graphActivity("created", node, "Created a knowledge node.", actor),
    );
    snapshot.generatedAt = createdAt;
    await saveSnapshot(snapshot);
    return node;
  },

  async updateNode(id: string, patch: NodePatch, actor = "API client") {
    const snapshot = await loadSnapshot();
    const index = snapshot.nodes.findIndex((node) => node.id === id);
    if (index < 0) return null;
    const updated = { ...snapshot.nodes[index], ...patch, updatedAt: timestamp() };
    snapshot.nodes[index] = updated;
    snapshot.activities.unshift(
      graphActivity("updated", updated, "Updated knowledge metadata.", actor),
    );
    snapshot.generatedAt = updated.updatedAt;
    await saveSnapshot(snapshot);
    return updated;
  },

  async addLink(input: NewLinkInput, actor = "API client") {
    const snapshot = await loadSnapshot();
    const sourceNode = snapshot.nodes.find((node) => node.id === input.source && !node.deletedAt);
    const targetNode = snapshot.nodes.find((node) => node.id === input.target && !node.deletedAt);
    if (!sourceNode || !targetNode || input.source === input.target) return null;
    const duplicate = snapshot.links.some(
      (link) =>
        !link.deletedAt &&
        link.source === input.source &&
        link.target === input.target &&
        link.type === input.type,
    );
    if (duplicate) return null;
    const createdAt = timestamp();
    const link: KnowledgeLink = {
      id: identifier("link"),
      source: input.source,
      target: input.target,
      type: input.type,
      strength: input.strength ?? 0.75,
      verified: input.verified ?? false,
      description: input.description,
      sourceIds: input.sourceIds,
      createdAt,
      updatedAt: createdAt,
    };
    snapshot.links.push(link);
    snapshot.activities.unshift(
      graphActivity(
        "linked",
        sourceNode,
        `Linked to ${targetNode.label} via ${input.type.replaceAll("_", " ")}.`,
        actor,
      ),
    );
    snapshot.generatedAt = createdAt;
    await saveSnapshot(snapshot);
    return link;
  },

  async softDeleteNode(id: string, actor = "API client") {
    const snapshot = await loadSnapshot();
    const node = snapshot.nodes.find((item) => item.id === id);
    if (!node) return null;
    const deletedAt = timestamp();
    node.deletedAt = deletedAt;
    node.updatedAt = deletedAt;
    snapshot.links.forEach((link) => {
      if (link.source === id || link.target === id) {
        link.deletedAt = deletedAt;
        link.updatedAt = deletedAt;
      }
    });
    snapshot.activities.unshift(
      graphActivity("removed", node, "Soft-deleted node and attached relationships.", actor),
    );
    snapshot.generatedAt = deletedAt;
    await saveSnapshot(snapshot);
    return node;
  },

  async deprecateNode(id: string, actor = "API client") {
    return this.updateNode(id, { status: "deprecated" }, actor);
  },

  async restoreNode(id: string, actor = "API client") {
    const snapshot = await loadSnapshot();
    const node = snapshot.nodes.find((item) => item.id === id);
    if (!node) return null;
    node.deletedAt = undefined;
    node.updatedAt = timestamp();
    snapshot.activities.unshift(
      graphActivity("restored", node, "Restored a removed knowledge node.", actor),
    );
    snapshot.generatedAt = node.updatedAt;
    await saveSnapshot(snapshot);
    return node;
  },

  async reset() {
    const snapshot = await loadLeadGraph();
    await saveSnapshot(snapshot);
    return snapshot;
  },
};
