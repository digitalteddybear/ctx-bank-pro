import type { GraphSnapshot, KnowledgeLink, KnowledgeNode } from "./types";

export interface NetronNodeRecord {
  id: string;
  label: string;
  shortLabel: string;
  type: KnowledgeNode["type"];
  status: KnowledgeNode["status"];
  authority: KnowledgeNode["authority"];
  confidence: number;
  sourceCount: number;
  linkCount: number;
}

export interface NetronEdgeRecord {
  id: string;
  source: string;
  target: string;
  type: KnowledgeLink["type"];
  label: string;
  verified: boolean;
  strength: number;
}

export interface NetronGraphRecords {
  nodes: NetronNodeRecord[];
  edges: NetronEdgeRecord[];
}

const shortLabel = (value: string) => value.length > 34 ? `${value.slice(0, 33)}…` : value;

export function createNetronGraphRecords(
  snapshot: GraphSnapshot,
  visibleNodeIds?: ReadonlySet<string>,
): NetronGraphRecords {
  const nodes = snapshot.nodes.filter(
    (node) => !node.deletedAt && (!visibleNodeIds || visibleNodeIds.has(node.id)),
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = snapshot.links.filter(
    (link) =>
      !link.deletedAt &&
      nodeIds.has(link.source) &&
      nodeIds.has(link.target),
  );
  const linkCounts = new Map<string, number>();
  for (const edge of edges) {
    linkCounts.set(edge.source, (linkCounts.get(edge.source) ?? 0) + 1);
    linkCounts.set(edge.target, (linkCounts.get(edge.target) ?? 0) + 1);
  }

  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      label: node.label,
      shortLabel: shortLabel(node.label),
      type: node.type,
      status: node.status,
      authority: node.authority,
      confidence: node.confidence,
      sourceCount: node.sources.length,
      linkCount: linkCounts.get(node.id) ?? 0,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: edge.type.replaceAll("_", " "),
      verified: edge.verified,
      strength: edge.strength,
    })),
  };
}
