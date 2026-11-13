import type {
  AuthorityLevel,
  EdgeType,
  GraphActivity,
  GraphSnapshot,
  KnowledgeLink,
  KnowledgeNode,
  NodeStatus,
  NodeType,
  SourceReference,
} from "./types";

const CREATED_AT = "2026-07-23T08:00:00.000Z";

const source = (
  sourceId: string,
  path: string,
  locator?: string,
  excerpt?: string,
): SourceReference => ({ sourceId, path, locator, excerpt });

const node = (
  id: string,
  label: string,
  type: NodeType,
  description: string,
  options: {
    status?: NodeStatus;
    authority?: AuthorityLevel;
    confidence?: number;
    tags?: string[];
    sources?: SourceReference[];
  } = {},
): KnowledgeNode => ({
  id,
  label,
  type,
  description,
  status: options.status ?? "verified",
  authority: options.authority ?? "operational",
  confidence: options.confidence ?? 0.94,
  tags: options.tags ?? [],
  sources: options.sources ?? [],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
});

const link = (
  id: string,
  sourceId: string,
  targetId: string,
  type: EdgeType,
  options: {
    strength?: number;
    verified?: boolean;
    description?: string;
    sourceIds?: string[];
  } = {},
): KnowledgeLink => ({
  id,
  source: sourceId,
  target: targetId,
  type,
  strength: options.strength ?? 0.8,
  verified: options.verified ?? true,
  description: options.description,
  sourceIds: options.sourceIds,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
});

const architectureSource = source(
  "source-business-architecture",
  "../world_creators_business_architecture.md",
  "Audited business architecture",
);
const masterSource = source(
  "source-master-context",
  "../context/master-context-document.txt",
  "Master context document",
);
const bulletproofSource = source(
  "source-bulletproof-workspace",
  "../all-other-files/ASP-Private-Capital/Stage-1/Bulletproof-Offer-Workspace.csv",
  "Authoritative eight-stage workspace export",
);
const creatorSource = source(
  "source-creator-signature",
  "../context/Creator Signature — Foundational Influences & Worldview.rtf",
  "Creator Signature worldview",
);
const conversionSource = source(
  "source-conversion-core",
  "../context/conversion-core.txt",
  "Conversion Core operating context",
);

const nodes: KnowledgeNode[] = [
  node(
    "asp-private-capital",
    "ASP Private Capital",
    "organization",
    "A private-market liaison and capital introducer bridging private investors with institutional opportunities across managed funds, private equity, and precious metals.",
    { authority: "primary", sources: [architectureSource], tags: ["core", "organization"] },
  ),
  node(
    "strategic-synthesis",
    "Strategic Synthesis",
    "framework",
    "The operating logic that converts client context into a reusable strategic system.",
    { sources: [architectureSource, masterSource], tags: ["strategy", "context"] },
  ),
  node(
    "creator-signature",
    "Creator Signature™",
    "offer",
    "A founder-led authority and authored-signal system designed to make a distinctive point of view recognisable and commercially useful.",
    { authority: "primary", sources: [architectureSource, creatorSource], tags: ["authorship", "authority"] },
  ),
  node(
    "bulletproof-offer",
    "Bulletproof Offer™",
    "framework",
    "An eight-stage guided offer-creation process that produces an exportable offer document.",
    { authority: "primary", sources: [bulletproofSource, architectureSource], tags: ["offer", "positioning"] },
  ),
  node(
    "conversion-core",
    "Conversion Core",
    "system",
    "A three-week implementation shape combining offer or avatar clarity, VSL, conversion spine, CRM, and measured handoff.",
    { authority: "primary", sources: [conversionSource, architectureSource], tags: ["conversion", "delivery"] },
  ),
  node(
    "vsl-growth-system",
    "VSL Growth System™",
    "framework",
    "A persuasive narrative and deployment layer that moves qualified prospects from attention to conversation.",
    { sources: [architectureSource, conversionSource], tags: ["vsl", "narrative"] },
  ),
  node(
    "avatar-precision-engine",
    "Avatar Precision Engine™",
    "framework",
    "A buyer-understanding framework for clarifying the audience, problem, desired transformation, decision logic, and objections.",
    { sources: [architectureSource], tags: ["audience", "research"] },
  ),
  node(
    "unique-mechanism-builder",
    "Unique Mechanism Builder™",
    "framework",
    "A framework for converting a specific method into an explainable and defensible mechanism.",
    { sources: [architectureSource], tags: ["mechanism", "positioning"] },
  ),
  node(
    "community-mentorship",
    "Community Mentorship",
    "offer",
    "A guided environment that gives founders access to strategic logic, reusable resources, feedback, and implementation support.",
    { sources: [architectureSource], tags: ["community", "education"] },
  ),
  node(
    "automation-deployment",
    "VSL & Automation Deployment",
    "offer",
    "Implementation services spanning VSL strategy, conversion systems, CRM workflows, automation, and operational handoff.",
    { sources: [architectureSource], tags: ["automation", "implementation"] },
  ),
  node(
    "authored-signal",
    "Authored Signal",
    "concept",
    "A recognisable founder perspective expressed consistently through language, ideas, choices, and content.",
    { sources: [architectureSource, creatorSource], tags: ["authorship", "signal"] },
  ),
  node(
    "contextual-engineering",
    "Contextual Engineering",
    "process",
    "The collection, structuring, and deployment of client context into a governed operating system.",
    { sources: [architectureSource, masterSource], tags: ["context", "knowledge"] },
  ),
  node(
    "second-brain",
    "Second Brain",
    "deliverable",
    "A governed contextual knowledge layer that preserves language, offers, decisions, assets, and operational logic.",
    { sources: [architectureSource, masterSource], tags: ["knowledge", "deliverable"] },
  ),
  node(
    "foundation-document",
    "Bulletproof Foundation Document",
    "deliverable",
    "The structured synthesis produced from client discovery before deployment into the Second Brain.",
    { sources: [architectureSource, masterSource], tags: ["synthesis", "deliverable"] },
  ),
  node(
    "performance-frame",
    "Performance Frame",
    "framework",
    "The commercial frame connecting positioning, conversion, and operating leverage.",
    { sources: [architectureSource], tags: ["positioning", "commercial"] },
  ),
  node(
    "authorship-frame",
    "Authorship Frame",
    "framework",
    "The frame that turns founder thinking into recognisable ideas, language, and intellectual property.",
    { sources: [architectureSource, creatorSource], tags: ["authorship", "content"] },
  ),
  node(
    "infrastructure-frame",
    "Infrastructure Frame",
    "framework",
    "The frame connecting visible strategy to the systems, assets, channels, and feedback loops that operationalise it.",
    { sources: [architectureSource], tags: ["systems", "operations"] },
  ),
  node(
    "qualified-founder",
    "Qualified Founder",
    "audience",
    "A performance-oriented founder with existing expertise, a credible offer, and sufficient delivery capacity to benefit from strategic infrastructure.",
    { sources: [architectureSource], tags: ["audience", "fit"] },
  ),
  node(
    "long-form-content",
    "Long-form Content",
    "channel",
    "The primary depth surface for worldview, mechanism, proof, and narrative development.",
    { sources: [architectureSource, creatorSource], tags: ["content", "channel"] },
  ),
  node(
    "short-form-content",
    "Short-form Content",
    "channel",
    "A distribution and amplification surface that extracts ideas from the deeper narrative system.",
    { sources: [architectureSource, creatorSource], tags: ["content", "channel"] },
  ),
  node(
    "youtube",
    "YouTube",
    "channel",
    "A long-form authority-building channel used to develop familiarity, narrative depth, and qualified interest.",
    { sources: [architectureSource], tags: ["content", "channel"] },
  ),
  node(
    "revenue-portfolio",
    "Revenue Portfolio",
    "system",
    "A qualitative set of complementary commercial roles: learning and access, strategic collaboration, build and deployment, and continuity.",
    { sources: [architectureSource], tags: ["commercial", "revenue"] },
  ),
  node(
    "commercial-evidence-gap",
    "Commercial Evidence Gap",
    "decision",
    "Named operating frameworks are documented, while independent proof of recurring revenue, retention, margins, and client outcomes remains incomplete.",
    {
      status: "review",
      authority: "operational",
      confidence: 0.99,
      sources: [architectureSource],
      tags: ["evidence", "risk"],
    },
  ),
  node(
    "creator-signature-demand",
    "Creator Signature Demand Effect",
    "claim",
    "A more recognisable authored position may improve trust, recognition, and qualified demand.",
    {
      status: "hypothesis",
      confidence: 0.72,
      sources: [architectureSource, creatorSource],
      tags: ["hypothesis", "commercial"],
    },
  ),
  node(
    "source-business-architecture",
    "Operational Context & Knowledge Bank",
    "source",
    "The audited ASP Private Capital business architecture and evidence register.",
    { authority: "primary", sources: [architectureSource], tags: ["source", "audited"] },
  ),
  node(
    "source-master-context",
    "Master Context Document",
    "source",
    "A broad operating-context document containing strategy, offer, and system summaries.",
    { authority: "supporting", sources: [masterSource], tags: ["source", "context"] },
  ),
  node(
    "source-bulletproof-workspace",
    "Bulletproof Offer Workspace",
    "source",
    "The authoritative full workspace export containing the eight-stage offer process.",
    { authority: "primary", sources: [bulletproofSource], tags: ["source", "authoritative"] },
  ),
  node(
    "source-creator-signature",
    "Creator Signature Worldview",
    "source",
    "Foundational influences, worldview, and authorship principles for Creator Signature.",
    { authority: "primary", sources: [creatorSource], tags: ["source", "authorship"] },
  ),
  node(
    "source-conversion-core",
    "Conversion Core Context",
    "source",
    "Operating context for the Conversion Core offer and delivery system.",
    { authority: "primary", sources: [conversionSource], tags: ["source", "conversion"] },
  ),
  ...[
    ["bp-stage-1", "Transformational Statement & Goals"],
    ["bp-stage-2", "What We Focus On"],
    ["bp-stage-3", "Transform Specific Method into Unique Mechanism"],
    ["bp-stage-4", "Turn Your Unique Mechanism Into 3 Tangible Phases"],
    ["bp-stage-5", "Back Story"],
    ["bp-stage-6", "Refine Specific Method"],
    ["bp-stage-7", "Who This Is (and Isn’t) For"],
    ["bp-stage-8", "Defining Your Deliverables"],
  ].map(([id, label], index) =>
    node(
      id,
      label,
      "stage",
      `Stage ${index + 1} of the authoritative Bulletproof Offer™ workspace sequence.`,
      {
        authority: "primary",
        sources: [bulletproofSource],
        tags: ["bulletproof-offer", `stage-${index + 1}`],
      },
    ),
  ),
];

const links: KnowledgeLink[] = [
  link("l-001", "asp-private-capital", "strategic-synthesis", "contains"),
  link("l-002", "asp-private-capital", "community-mentorship", "contains"),
  link("l-003", "asp-private-capital", "automation-deployment", "contains"),
  link("l-004", "strategic-synthesis", "creator-signature", "delivers"),
  link("l-005", "strategic-synthesis", "bulletproof-offer", "delivers"),
  link("l-006", "strategic-synthesis", "contextual-engineering", "contains"),
  link("l-007", "contextual-engineering", "foundation-document", "delivers"),
  link("l-008", "foundation-document", "second-brain", "precedes"),
  link("l-009", "conversion-core", "vsl-growth-system", "contains"),
  link("l-010", "conversion-core", "avatar-precision-engine", "depends_on"),
  link("l-011", "conversion-core", "bulletproof-offer", "depends_on"),
  link("l-012", "conversion-core", "automation-deployment", "used_by"),
  link("l-013", "creator-signature", "authored-signal", "defines"),
  link("l-014", "creator-signature", "long-form-content", "expressed_through"),
  link("l-015", "creator-signature", "short-form-content", "expressed_through"),
  link("l-016", "creator-signature", "youtube", "expressed_through"),
  link("l-017", "creator-signature", "qualified-founder", "targets"),
  link("l-018", "bulletproof-offer", "qualified-founder", "targets"),
  link("l-019", "automation-deployment", "qualified-founder", "targets"),
  link("l-020", "bulletproof-offer", "unique-mechanism-builder", "contains"),
  link("l-021", "asp-private-capital", "performance-frame", "contains"),
  link("l-022", "asp-private-capital", "authorship-frame", "contains"),
  link("l-023", "asp-private-capital", "infrastructure-frame", "contains"),
  link("l-024", "performance-frame", "conversion-core", "supports"),
  link("l-025", "authorship-frame", "creator-signature", "supports"),
  link("l-026", "infrastructure-frame", "second-brain", "supports"),
  link("l-027", "asp-private-capital", "revenue-portfolio", "contains"),
  link("l-028", "creator-signature-demand", "creator-signature", "derived_from"),
  link("l-029", "commercial-evidence-gap", "creator-signature-demand", "related_to"),
  link("l-030", "source-business-architecture", "asp-private-capital", "defines"),
  link("l-031", "source-master-context", "strategic-synthesis", "supports"),
  link("l-032", "source-bulletproof-workspace", "bulletproof-offer", "defines"),
  link("l-033", "source-creator-signature", "creator-signature", "defines"),
  link("l-034", "source-conversion-core", "conversion-core", "defines"),
  ...Array.from({ length: 8 }, (_, index) =>
    link(
      `l-bp-${index + 1}`,
      "bulletproof-offer",
      `bp-stage-${index + 1}`,
      "contains",
      { sourceIds: ["source-bulletproof-workspace"] },
    ),
  ),
  ...Array.from({ length: 7 }, (_, index) =>
    link(
      `l-seq-${index + 1}`,
      `bp-stage-${index + 1}`,
      `bp-stage-${index + 2}`,
      "precedes",
      { strength: 0.95, sourceIds: ["source-bulletproof-workspace"] },
    ),
  ),
];

const activities: GraphActivity[] = [
  {
    id: "activity-1",
    action: "imported",
    subjectId: "source-business-architecture",
    subjectLabel: "Operational Context & Knowledge Bank",
    actor: "Ingestion pipeline",
    timestamp: "2026-07-23T08:04:00.000Z",
    detail: "Imported audited business architecture with source hierarchy.",
  },
  {
    id: "activity-2",
    action: "updated",
    subjectId: "bulletproof-offer",
    subjectLabel: "Bulletproof Offer™",
    actor: "Evidence audit",
    timestamp: "2026-07-23T08:08:00.000Z",
    detail: "Verified all eight stage names against the authoritative workspace export.",
  },
  {
    id: "activity-3",
    action: "linked",
    subjectId: "creator-signature-demand",
    subjectLabel: "Creator Signature Demand Effect",
    actor: "Evidence audit",
    timestamp: "2026-07-23T08:11:00.000Z",
    detail: "Classified commercial effect as a hypothesis pending independent evidence.",
  },
];

export const initialGraph: GraphSnapshot = {
  schemaVersion: "1.0",
  generatedAt: CREATED_AT,
  nodes,
  links,
  activities,
};
