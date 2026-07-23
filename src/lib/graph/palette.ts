import type { NodeStatus, NodeType } from "./types";

export const nodeTypeColors: Record<NodeType, string> = {
  organization: "#F7F8FC",
  framework: "#58D3DB",
  process: "#00B87A",
  stage: "#AAEEF3",
  system: "#17BF63",
  offer: "#58D3DB",
  audience: "#F7B928",
  concept: "#AAEEF3",
  claim: "#E0245E",
  evidence: "#17BF63",
  deliverable: "#58D3DB",
  channel: "#F7B928",
  source: "#8B96A9",
  decision: "#F4212E",
};

export const nodeStatusColors: Record<NodeStatus, string> = {
  verified: "#17BF63",
  hypothesis: "#F7B928",
  review: "#58D3DB",
  conflicted: "#F4212E",
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
