import type { NodeStatus, NodeType } from "./types";

export const nodeTypeColors: Record<NodeType, string> = {
  organization: "#F7F8FC",
  framework: "#8B7CFF",
  process: "#7D9CFF",
  stage: "#B7AFFF",
  system: "#5ED5C8",
  offer: "#D184FF",
  audience: "#F6B55D",
  concept: "#6EE7F2",
  claim: "#F091B8",
  evidence: "#72D8A2",
  deliverable: "#90B5FF",
  channel: "#F5CD75",
  source: "#8B96A9",
  decision: "#FF8E7A",
};

export const nodeStatusColors: Record<NodeStatus, string> = {
  verified: "#72D8A2",
  hypothesis: "#F6B55D",
  review: "#7D9CFF",
  conflicted: "#FF6B7A",
  deprecated: "#687386",
};

export const nodeTypeLabels: Record<NodeType, string> = {
  organization: "Organization",
  framework: "Framework",
  process: "Process",
  stage: "Process stage",
  system: "System",
  offer: "Offer",
  audience: "Audience",
  concept: "Concept",
  claim: "Claim",
  evidence: "Evidence",
  deliverable: "Deliverable",
  channel: "Channel",
  source: "Source",
  decision: "Decision",
};
