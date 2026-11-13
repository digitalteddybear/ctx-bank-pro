export const NODE_TYPES = [
  "organization",
  "framework",
  "process",
  "stage",
  "system",
  "offer",
  "audience",
  "concept",
  "claim",
  "evidence",
  "deliverable",
  "channel",
  "source",
  "decision",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_STATUSES = [
  "verified",
  "hypothesis",
  "review",
  "conflicted",
  "deprecated",
] as const;

export type NodeStatus = (typeof NODE_STATUSES)[number];

export const AUTHORITY_LEVELS = [
  "primary",
  "operational",
  "supporting",
  "historical",
  "agent-generated",
] as const;

export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

export const EDGE_TYPES = [
  "contains",
  "defines",
  "part_of",
  "precedes",
  "depends_on",
  "supports",
  "contradicts",
  "supersedes",
  "derived_from",
  "targets",
  "solves",
  "delivers",
  "used_by",
  "expressed_through",
  "related_to",
  "semantically_similar_to",
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

export interface SourceReference {
  sourceId: string;
  path: string;
  locator?: string;
  excerpt?: string;
}

export interface LeadCrmContext {
  source: string; revision: string; observedAt: string; indexState: string; notice: string;
  properties: Record<string, string | null | undefined>;
}

export interface KnowledgeNode {
  crmContext?: LeadCrmContext;
  id: string;
  label: string;
  type: NodeType;
  description: string;
  status: NodeStatus;
  authority: AuthorityLevel;
  confidence: number;
  tags: string[];
  sources: SourceReference[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface KnowledgeLink {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  strength: number;
  verified: boolean;
  description?: string;
  sourceIds?: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface GraphActivity {
  id: string;
  action: "created" | "updated" | "linked" | "deprecated" | "restored" | "removed" | "imported";
  subjectId: string;
  subjectLabel: string;
  actor: string;
  timestamp: string;
  detail: string;
}

export interface GraphSnapshot {
  schemaVersion: "1.0";
  generatedAt: string;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  activities: GraphActivity[];
}

export interface GraphMetrics {
  activeNodes: number;
  relationships: number;
  verifiedPercent: number;
  sourceCoveragePercent: number;
  conflicts: number;
  pendingReview: number;
}

export interface GraphSearchResult {
  node: KnowledgeNode;
  score: number;
  reasons: string[];
}

export type NewNodeInput = Pick<KnowledgeNode, "label" | "type" | "description"> &
  Partial<Pick<KnowledgeNode, "status" | "authority" | "confidence" | "tags" | "sources">>;

export type NodePatch = Partial<
  Pick<
    KnowledgeNode,
    "label" | "type" | "description" | "status" | "authority" | "confidence" | "tags" | "sources"
  >
>;

export interface NewLinkInput {
  source: string;
  target: string;
  type: EdgeType;
  description?: string;
  strength?: number;
  verified?: boolean;
  sourceIds?: string[];
}
