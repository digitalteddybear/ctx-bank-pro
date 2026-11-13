export type ArchitectureArea = "agents" | "rag";
export interface ArchitectureCommit { hash: string; date: string; subject: string }
export interface ArchitectureNode extends Record<string, unknown> {
  id: string;
  name: string;
  area: ArchitectureArea;
  kind: "folder" | "file";
  path?: string;
  children?: ArchitectureNode[];
  fileCount: number;
  bytes: number;
  modified: string;
  commit: ArchitectureCommit | null;
}
export interface ArchitectureDraft {
  content: string;
  baseHash: string;
  revision: string;
  savedAt: string;
}
export interface ArchitectureFile {
  id: string;
  path: string;
  content: string;
  hash: string;
  draft: ArchitectureDraft | null;
}

/** Recompute every aggregate from surviving leaves, including after filtering. */
export function rollup(node: ArchitectureNode): ArchitectureNode {
  if (node.kind === "file") return node;
  const children = (node.children ?? []).map(rollup);
  const commits = children.flatMap(child => child.commit ? [child.commit] : []);
  return { ...node, children, fileCount: children.reduce((n, c) => n + c.fileCount, 0),
    bytes: children.reduce((n, c) => n + c.bytes, 0),
    modified: children.reduce((latest, c) => c.modified > latest ? c.modified : latest, ""),
    commit: commits.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null };
}
export function filterArchitecture(nodes: ArchitectureNode[], query: string): ArchitectureNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  return nodes.flatMap(node => {
    if (`${node.name} ${node.path ?? ""}`.toLowerCase().includes(needle)) return [node];
    const children = filterArchitecture(node.children ?? [], needle);
    return children.length ? [rollup({ ...node, children })] : [];
  });
}
export function flattenArchitecture(nodes: ArchitectureNode[]): ArchitectureNode[] {
  return nodes.flatMap(node => [node, ...flattenArchitecture(node.children ?? [])]);
}
