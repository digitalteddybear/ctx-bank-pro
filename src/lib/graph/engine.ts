import Fuse from "fuse.js";
import type {
  GraphMetrics,
  GraphSearchResult,
  GraphSnapshot,
  KnowledgeLink,
  KnowledgeNode,
} from "./types";

const active = <T extends { deletedAt?: string }>(item: T) => !item.deletedAt;

export function getActiveGraph(snapshot: GraphSnapshot): GraphSnapshot {
  const nodes = snapshot.nodes.filter(active);
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    ...snapshot,
    nodes,
    links: snapshot.links.filter(
      (link) => active(link) && nodeIds.has(link.source) && nodeIds.has(link.target),
    ),
  };
}

export function calculateMetrics(snapshot: GraphSnapshot): GraphMetrics {
  const graph = getActiveGraph(snapshot);
  const verified = graph.nodes.filter((node) => node.status === "verified").length;
  const sourced = graph.nodes.filter((node) => node.sources.length > 0).length;

  return {
    activeNodes: graph.nodes.length,
    relationships: graph.links.length,
    verifiedPercent: graph.nodes.length ? Math.round((verified / graph.nodes.length) * 100) : 0,
    sourceCoveragePercent: graph.nodes.length ? Math.round((sourced / graph.nodes.length) * 100) : 0,
    conflicts: graph.nodes.filter((node) => node.status === "conflicted").length,
    pendingReview: graph.nodes.filter(
      (node) => node.status === "review" || node.status === "hypothesis",
    ).length,
  };
}

export function searchGraph(
  snapshot: GraphSnapshot,
  query: string,
  limit = 12,
): GraphSearchResult[] {
  const graph = getActiveGraph(snapshot);
  const normalized = query.trim();

  if (!normalized) {
    return graph.nodes.slice(0, limit).map((node) => ({
      node,
      score: node.authority === "primary" ? 1 : 0.7,
      reasons: node.authority === "primary" ? ["Primary authority"] : ["Active node"],
    }));
  }

  const fuse = new Fuse(graph.nodes, {
    keys: [
      { name: "label", weight: 0.45 },
      { name: "description", weight: 0.28 },
      { name: "crmContext.properties", weight: 0.1, getFn: (node: KnowledgeNode) => Object.values(node.crmContext?.properties ?? {}).filter((v): v is string => typeof v === "string") },
      { name: "tags", weight: 0.17 },
      { name: "type", weight: 0.1 },
    ],
    includeMatches: true,
    includeScore: true,
    threshold: 0.42,
    ignoreLocation: true,
  });

  return fuse.search(normalized, { limit }).map((result) => {
    const reasons = new Set<string>();
    result.matches?.forEach((match) => {
      if (match.key === "label") reasons.add("Title match");
      if (match.key === "description") reasons.add("Description match");
      if (match.key === "tags") reasons.add("Tag match");
      if (match.key === "type") reasons.add("Node type match");
    });
    if (result.item.authority === "primary") reasons.add("Primary authority");

    return {
      node: result.item,
      score: Number((1 - (result.score ?? 1)).toFixed(3)),
      reasons: [...reasons],
    };
  });
}

export function getNeighborhood(
  snapshot: GraphSnapshot,
  nodeId: string,
  depth = 1,
): { nodes: KnowledgeNode[]; links: KnowledgeLink[] } {
  const graph = getActiveGraph(snapshot);
  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);
  const links: KnowledgeLink[] = [];

  for (let level = 0; level < Math.max(1, depth); level += 1) {
    const next = new Set<string>();
    graph.links.forEach((link) => {
      if (frontier.has(link.source) || frontier.has(link.target)) {
        links.push(link);
        const counterpart = frontier.has(link.source) ? link.target : link.source;
        if (!visited.has(counterpart)) next.add(counterpart);
      }
    });
    next.forEach((id) => visited.add(id));
    frontier = next;
    if (!frontier.size) break;
  }

  return {
    nodes: graph.nodes.filter((node) => visited.has(node.id)),
    links: [...new Map(links.map((link) => [link.id, link])).values()],
  };
}

export function findShortestPath(
  snapshot: GraphSnapshot,
  sourceId: string,
  targetId: string,
): { nodes: KnowledgeNode[]; links: KnowledgeLink[] } | null {
  const graph = getActiveGraph(snapshot);
  const adjacency = new Map<string, Array<{ nodeId: string; link: KnowledgeLink }>>();

  graph.links.forEach((link) => {
    adjacency.set(link.source, [...(adjacency.get(link.source) ?? []), { nodeId: link.target, link }]);
    adjacency.set(link.target, [...(adjacency.get(link.target) ?? []), { nodeId: link.source, link }]);
  });

  const queue = [sourceId];
  const previous = new Map<string, { nodeId: string; link: KnowledgeLink }>();
  const visited = new Set([sourceId]);

  while (queue.length) {
    const current = queue.shift()!;
    if (current === targetId) break;

    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor.nodeId)) continue;
      visited.add(neighbor.nodeId);
      previous.set(neighbor.nodeId, { nodeId: current, link: neighbor.link });
      queue.push(neighbor.nodeId);
    }
  }

  if (!visited.has(targetId)) return null;

  const pathNodeIds = [targetId];
  const pathLinks: KnowledgeLink[] = [];
  let current = targetId;

  while (current !== sourceId) {
    const step = previous.get(current);
    if (!step) return null;
    pathLinks.unshift(step.link);
    current = step.nodeId;
    pathNodeIds.unshift(current);
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return {
    nodes: pathNodeIds.map((id) => nodeById.get(id)).filter(Boolean) as KnowledgeNode[],
    links: pathLinks,
  };
}
