#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "ctx-bank-knowledge",
  version: "1.0.0",
});

const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

// ============================================================================
// CTX PLATFORM & CTX BANK KNOWLEDGE BASE (CLIENT-AGNOSTIC / UNIVERSAL)
// ============================================================================

const CTX_PLATFORM_MANIFEST = {
  platform: "CTX (Context Engineering & Autonomous Operations Platform)",
  core_engine: "CTX Bank (The Sovereign Context Bank & Agent Operating System)",
  version: "1.0.0 Pro Enterprise",
  architecture_summary:
    "A sovereign context engine and deterministic runtime designed to eliminate hallucination, prevent credential leakage, and govern autonomous agent operations in high-consequence enterprise environments.",
  ecosystem_reach: {
    deployments: "Deployed across 12+ enterprise partner instances operating production agent systems",
    sectors: ["Asset Management & Capital Markets", "Regulated Financial Operations", "High-Value Enterprise B2B"],
    business_model: "Outcome-as-a-Service (OaaS) — pricing, performance, and SLAs are benchmarked against guaranteed, verified business outcomes rather than raw software seat licenses or token volume.",
  },
  core_axioms: [
    {
      axiom: "Evidence-Cited Truth Boundary",
      rule: "CTX Bank serves as the canonical repository of verified organizational truth. Agents are strictly bound to this perimeter; no agent may assert facts or claims lacking verifiable source provenance.",
    },
    {
      axiom: "Deterministic State Machine Control",
      rule: "Consequential workflows, state transitions, and external actions are governed by deterministic code and state machines. The LLM acts as an intelligence generator, not an unconstrained process controller.",
    },
    {
      axiom: "Zero-Trust Integration Architecture",
      rule: "No LLM, agent context, or prompt ever receives raw external credentials (API keys, database passwords, OAuth tokens). External mutations pass through typed, schema-validated, fail-closed micro-gateways.",
    },
    {
      axiom: "Cryptographic Hash-Locked Governance",
      rule: "All consequential actions require compliance verification. Human-in-the-loop approvals are mathematically bound to the SHA-256 hash of the payload; any subsequent alteration immediately revokes approval.",
    },
    {
      axiom: "Sovereign Multi-Tenant Isolation",
      rule: "Each deployment operates with isolated SQLite WAL singletons anchored to globalThis, private vector and graph stores, and dedicated audit trails, ensuring zero cross-tenant data bleed and complete resilience against dev-server HMR leaks.",
    },
  ],
};

const AGENT_OPERATING_SYSTEM = {
  architecture: "CTX Agent Operating System (AOS)",
  description:
    "Rather than monolithic agents that attempt to do everything, CTX organizes autonomous operations into five decoupled, specialized agent archetypes governed by a central deterministic state machine.",
  archetypes: [
    {
      archetype: "Context Synthesizer (Intelligence & Dossier Builder)",
      purpose: "Gathers, cross-references, and synthesizes verified evidence from CTX Bank.",
      responsibilities: [
        "Ingests raw documents, system records, and relational graph nodes into structured context dossiers.",
        "Generates evidence-cited briefs with explicit source chunk references and provenance hashes.",
        "Identifies missing information, ambiguities, or conflicting data, strictly refusing to hallucinate or speculate.",
      ],
      perimeter: "Internal CTX Bank knowledge graph and verified vector stores (Read-Only)",
    },
    {
      archetype: "Action Drafter (Execution & Generation)",
      purpose: "Formulates structured proposals, plans, communications, or operational artifacts.",
      responsibilities: [
        "Produces draft operations (e.g. communications, document drafts, API payloads, filing records) strictly grounded in the synthesized dossier.",
        "Enforces tenant persona, formatting requirements, and approved product or service positioning.",
        "Emits deterministic payload proposals with computed SHA-256 content hashes for compliance verification.",
      ],
      perimeter: "Intelligence briefs + tenant operational templates (Generative, No Direct External Side-Effects)",
    },
    {
      archetype: "Event Observer & Classifier (Triage & State Routing)",
      purpose: "Monitors incoming streams, inbound responses, and external event triggers.",
      responsibilities: [
        "Evaluates inbound external communications, webhook payloads, or operational events.",
        "Classifies intent deterministically (e.g., positive progress, information request, dispute/complaint, opt-out, error).",
        "Triggers corresponding state machine transitions (e.g. routing to scheduling, escalating to human operators, or executing immediate suppression).",
      ],
      perimeter: "Inbound communication streams & webhook listeners",
    },
    {
      archetype: "Infrastructure & Hygiene Daemon (Transport Guardian)",
      purpose: "Validates technical hygiene, transport safety, and system health.",
      responsibilities: [
        "Verifies transport protocols, authentication records, domain hygiene, and rate limits.",
        "Monitors recipient validity, syntax, bounce risks, and technical error rates.",
        "Injects cryptographic tracking tokens and enforces automated circuit breakers when anomaly thresholds are exceeded.",
      ],
      perimeter: "Outbound queue, DNS/transport health, and network telemetry",
    },
    {
      archetype: "Policy & Compliance Auditor (Independent Governance Gate)",
      purpose: "Enforces tenant policy, regulatory rules, and safety perimeters.",
      responsibilities: [
        "Conducts independent, objective evaluations of proposed actions against configured policies and regulatory perimeters.",
        "Verifies that required disclosures, footers, and statutory disclaimers are present.",
        "Verifies that human approval hashes (SHA-256) match the exact proposed payload before authorizing dispatch.",
        "Maintains an immutable audit certificate (PASS / QUARANTINE / REJECT) for every attempted action.",
      ],
      perimeter: "Final draft payloads + tenant policy matrices",
    },
  ],
};

const ZERO_TRUST_GATEWAY_ARCHITECTURE = {
  architecture: "Zero-Trust Fail-Closed Gateway Pattern",
  core_principles: [
    {
      principle: "The Credential Wall",
      detail: "Agents, prompts, and LLM completions never possess or see external API keys, database connection strings, or service tokens.",
    },
    {
      principle: "Deterministic Micro-Gateways",
      detail: "All external mutations (CRM updates, external messaging, financial actions, calendar reservations) are handled by dedicated deterministic micro-gateways separate from the LLM runtime.",
    },
    {
      principle: "Strict Schema Enforcement",
      detail: "Every mutation must conform to strict Zod runtime schemas. Arbitrary or un-allowlisted property modifications are rejected automatically with 403 / DENIED_UNKNOWN_OPERATION.",
    },
    {
      principle: "Fail-Closed Execution Mode",
      detail: "External write switches default to false. In this mode, mutations are executed in dry-run simulation mode, writing full payloads to append-only audit tables without touching external live systems.",
    },
    {
      principle: "Cryptographic Webhook Signatures",
      detail: "All incoming webhook events (e.g. scheduling, payment notifications, CRM triggers) are verified using HMAC-SHA256 signatures before triggering state machine transitions.",
    },
    {
      principle: "Append-Only Audit Ledger",
      detail: "All operations, status codes, and timestamps are recorded in dedicated SQLite audit databases with zero secret leakage and SHA-256 hashed identity references.",
    },
  ],
};

const GOVERNANCE_AND_APPROVAL_MATRIX = {
  title: "CTX Sovereign Governance & Approval Protocol",
  mechanisms: [
    {
      mechanism: "SHA-256 Hash-Locked Approvals",
      description:
        "Human operator approvals are cryptographically bound to the SHA-256 digest of the proposed payload. If an operator, agent, or process alters a single character, the approval is instantly voided and the item returns to unreviewed status.",
    },
    {
      mechanism: "Configurable Policy Perimeters",
      description:
        "Each tenant instance defines pluggable policy rules (e.g., regulatory boundaries, unauthorized claims, mandatory disclosures, privacy footers). The Compliance Auditor checks every proposal against these rules.",
    },
    {
      mechanism: "Immediate Suppression & Unsubscribe Handling",
      description:
        "Any expression of opt-out, unsubscribe, or negative sentiment triggers immediate, deterministic suppression across all active campaigns and propagates to the tenant system of record.",
    },
    {
      mechanism: "Quarantine & Anomaly Circuit Breakers",
      description:
        "Actions containing unverified claims, anomalous payload sizes, or sudden velocity spikes are diverted to an isolated Quarantine queue for manual human inspection.",
    },
  ],
};

const OAAS_PLAYBOOK = {
  title: "Outcome-as-a-Service (OaaS) Delivery Framework",
  summary:
    "How CTX Bank enables enterprise deployments to transition from software tool licensing to guaranteed operational outcomes.",
  pillars: [
    {
      pillar: "Outcome-Indexed Economics",
      explanation:
        "Clients do not pay for software seats or raw LLM token consumption. Value is indexed to verified business outcomes (e.g., qualified enterprise meetings, compliance-cleared transactions, processed records).",
    },
    {
      pillar: "Dual-Mode Sandboxing",
      explanation:
        "Every client instance supports two distinct execution environments: (1) High-Fidelity Sandbox Simulation, where real context and dossiers are processed against synthetic outboxes and mock systems of record; and (2) Authenticated Live Mode, where cleared actions are dispatched to production.",
    },
    {
      pillar: "Human-in-the-Loop Cockpit",
      explanation:
        "Autonomous fleets handle 95% of cognitive synthesis and drafting. Human operators govern the system via centralized dashboards (Mission Control / OS Tracker), granting final execution authorization at key checkpoints.",
    },
    {
      pillar: "Multi-Tenant Sovereign Deployment",
      explanation:
        "Each enterprise client instance is deployed with sovereign storage, private vector stores, isolated database files (SQLite WAL), and independent audit logs, preventing cross-tenant data commingling.",
    },
  ],
};

const FRESH_INSTANCE_BOOTSTRAP_GUIDE = {
  title: "CTX Bank Fresh-Instance Bootstrapping Guide for Autonomous Agents",
  intent:
    "Standard operating instructions provided alongside fresh-state CTX deployments. Ensures that newly initialized agents orient themselves, understand their boundaries, and complete prerequisite setup before executing operations.",
  agent_mental_model: [
    "You are an autonomous agent operating within a fresh-state deployment of CTX Bank.",
    "Do not make assumptions about client industry, brand identity, or product details. You must discover and inspect the tenant's ingested knowledge corpus dynamically.",
    "You have no direct permissions to mutate external systems or dispatch communications. All actions are submitted as structured proposals to the CTX deterministic state engine.",
    "Your operational objective is to deliver guaranteed business outcomes under an Outcome-as-a-Service (OaaS) contract with zero compliance infractions.",
  ],
  bootstrapping_checklist: [
    {
      phase: 1,
      name: "Knowledge Corpus Discovery",
      action: "Query CTX Bank to determine whether the tenant's canonical documents, product guides, and operational dossiers have been ingested into the graph and vector perimeters.",
      verification: "Confirm that knowledge nodes and extraction chunks are present and verified.",
    },
    {
      phase: 2,
      name: "Tenant Policy & Boundary Configuration",
      action: "Inspect the tenant's configured compliance perimeter, mandatory disclosures, and brand persona rules.",
      verification: "Ensure that all drafting templates enforce mandatory footers and disclaimer requirements.",
    },
    {
      phase: 3,
      name: "Integration Gateway Posture Check",
      action: "Check external integration gateways (CRMs, communication adapters, webhooks). Confirm that external write switches are intentionally set (defaulting to dry-run fail-closed).",
      verification: "Verify that audit logging databases are initialized cleanly.",
    },
    {
      phase: 4,
      name: "Infrastructure & Transport Hygiene Check",
      action: "Verify sending credentials, transport authentication, and domain DNS health records before enabling external communication.",
      verification: "Ensure deliverability daemon reports clean validation.",
    },
    {
      phase: 5,
      name: "High-Fidelity Sandbox Verification",
      action: "Execute test runs in sandbox simulation mode to evaluate end-to-end conversation trajectories, compliance scoring, and state transitions before toggling to production.",
      verification: "Inspect sandbox audit events in the operator cockpit.",
    },
  ],
};

const ARCHITECTURE_SUBSYSTEMS: Record<string, string> = {
  "runtime-engine": `
### CTX Deterministic Runtime Engine
- State machines control all agent lifecycle states: queued -> synthesizing_context -> drafting -> compliance_review -> awaiting_approval -> approved -> dispatched -> observing_event -> completed.
- Leased-lock task workers and bounded retries prevent split-brain execution across distributed threads.
- Server-Sent Events (SSE) stream operational progress directly to operator dashboards in real time.
  `,
  "sqlite-wal-singletons": `
### SQLite WAL Singletons & HMR Resilience
- Next.js Hot Module Replacement (HMR) re-evaluates modules on hot reloads, which can leak open SQLite file descriptors.
- CTX Bank attaches all database connection singletons to 'globalThis' (e.g. globalThis.__ctxOutreachStore, globalThis.__ctxHubSpotGateway).
- Configured pragmas: 'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;'.
- Guarantees 100% resilience against dev-server state-locks and database connection exhaustion.
  `,
  "context-graph-perimeter": `
### CTX Bank Knowledge Graph & Truth Perimeter
- Combines semantic vector embeddings with a multi-hop typed relationship graph (entities, concepts, sources, evidence).
- Ingestion pipelines extract text, generate chunks, record source authority, and compute cryptographic source hashes.
- Traversal supports cosine similarity search and 1-3 hop neighborhood queries to guarantee verifiable evidence citations.
  `,
  "zero-trust-gateways": `
### Zero-Trust Integration Gateways
- Completely isolates external systems of record from raw LLM prompts or agent tool execution.
- Strict Zod validation on all inbound and outbound payloads.
- Fail-closed kill-switches and append-only SQLite audit trails with zero credential leakage.
  `,
};

// ============================================================================
// TOOLS REGISTRATION
// ============================================================================

server.registerTool(
  "get_ctx_platform_overview",
  {
    title: "Get CTX Platform & CTX Bank Overview",
    description:
      "Retrieve the high-level architecture, mission, core axioms, and Outcome-as-a-Service (OaaS) reach of CTX and CTX Bank.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(CTX_PLATFORM_MANIFEST),
);

server.registerTool(
  "get_fresh_instance_orientation",
  {
    title: "Get Fresh-Instance Orientation for Autonomous Agents",
    description:
      "Essential guide for an agent initializing in a fresh-state CTX deployment. Details the agent mental model, onboarding checklist, and system boundaries.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(FRESH_INSTANCE_BOOTSTRAP_GUIDE),
);

server.registerTool(
  "get_agent_operating_system",
  {
    title: "Get CTX Agent Operating System (AOS) Archetypes",
    description:
      "Inspect the 5 universal agent archetypes (Context Synthesizer, Action Drafter, Event Observer, Infrastructure Daemon, Policy Auditor), their responsibilities, and execution boundaries.",
    inputSchema: {
      archetype: z
        .enum(["all", "synthesizer", "drafter", "observer", "daemon", "auditor"])
        .default("all")
        .describe("Specific archetype to inspect, or 'all' for the full operating system"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ archetype }) => {
    if (archetype === "all") return result(AGENT_OPERATING_SYSTEM);
    const indexMap: Record<string, number> = {
      synthesizer: 0,
      drafter: 1,
      observer: 2,
      daemon: 3,
      auditor: 4,
    };
    const target = AGENT_OPERATING_SYSTEM.archetypes[indexMap[archetype]];
    return result(target ?? { error: "Archetype not found", requested: archetype });
  },
);

server.registerTool(
  "get_zero_trust_architecture",
  {
    title: "Get Zero-Trust Integration Gateway Architecture",
    description:
      "Retrieve the security principles, credential isolation rules, fail-closed patterns, and append-only audit ledger specifications for external systems.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(ZERO_TRUST_GATEWAY_ARCHITECTURE),
);

server.registerTool(
  "get_governance_and_approval_matrix",
  {
    title: "Get Governance & Approval Protocol",
    description:
      "Retrieve the cryptographic SHA-256 hash-locked approval rules, policy perimeters, immediate suppression standards, and quarantine circuit breakers.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(GOVERNANCE_AND_APPROVAL_MATRIX),
);

server.registerTool(
  "get_oaas_framework",
  {
    title: "Get Outcome-as-a-Service (OaaS) Operating Guide",
    description:
      "Retrieve the commercial model, outcome benchmarking, dual-mode sandboxing, and sovereign multi-tenant isolation guidelines of CTX Bank.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(OAAS_PLAYBOOK),
);

server.registerTool(
  "query_ctx_architecture",
  {
    title: "Query CTX Bank Architecture Subsystems",
    description:
      "Inspect detailed technical architecture for specific subsystems (runtime-engine, sqlite-wal-singletons, context-graph-perimeter, zero-trust-gateways).",
    inputSchema: {
      subsystem: z.enum([
        "runtime-engine",
        "sqlite-wal-singletons",
        "context-graph-perimeter",
        "zero-trust-gateways",
      ]),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ subsystem }) => {
    const doc = ARCHITECTURE_SUBSYSTEMS[subsystem];
    return result(doc ? { subsystem, documentation: doc.trim() } : { error: "Subsystem not found" });
  },
);

// ============================================================================
// RESOURCES REGISTRATION
// ============================================================================

const resources = [
  {
    name: "platform-manifest",
    uri: "ctx://bank/platform-manifest",
    description: "CTX & CTX Bank architectural overview, mission, and ecosystem reach",
    data: CTX_PLATFORM_MANIFEST,
  },
  {
    name: "fresh-instance-orientation",
    uri: "ctx://bank/fresh-instance-orientation",
    description: "Onboarding and orientation guide for agents initializing in a fresh deployment",
    data: FRESH_INSTANCE_BOOTSTRAP_GUIDE,
  },
  {
    name: "agent-os-archetypes",
    uri: "ctx://bank/agent-os-archetypes",
    description: "Specifications for the 5 decoupled CTX agent archetypes",
    data: AGENT_OPERATING_SYSTEM,
  },
  {
    name: "zero-trust-gateway",
    uri: "ctx://bank/zero-trust-gateway",
    description: "Zero-trust fail-closed gateway specifications and audit rules",
    data: ZERO_TRUST_GATEWAY_ARCHITECTURE,
  },
  {
    name: "governance-hash-lock",
    uri: "ctx://bank/governance-hash-lock",
    description: "Cryptographic hash-locked approval and policy enforcement protocol",
    data: GOVERNANCE_AND_APPROVAL_MATRIX,
  },
  {
    name: "oaas-playbook",
    uri: "ctx://bank/oaas-playbook",
    description: "Outcome-as-a-Service operational playbook and commercial design",
    data: OAAS_PLAYBOOK,
  },
];

for (const res of resources) {
  server.registerResource(
    res.name,
    res.uri,
    { description: res.description, mimeType: "application/json" },
    async () => ({
      contents: [
        {
          uri: res.uri,
          mimeType: "application/json",
          text: JSON.stringify(res.data, null, 2),
        },
      ],
    }),
  );
}

// ============================================================================
// PROMPTS REGISTRATION
// ============================================================================

server.registerPrompt(
  "bootstrap_fresh_agent",
  {
    title: "Bootstrap Agent in Fresh CTX Bank Instance",
    description:
      "Conditions a newly initialized agent with universal CTX Bank operating axioms, evidence truth boundaries, and tenant isolation rules.",
    argsSchema: {
      agentArchetype: z
        .string()
        .describe("The archetype being assumed (e.g. 'Context Synthesizer', 'Action Drafter', 'Policy Auditor')"),
      tenantOrganizationName: z
        .string()
        .describe("The name of the enterprise client organization operating this CTX instance"),
      operationalDomain: z
        .string()
        .describe("The domain of operations (e.g. 'Private Capital', 'Supply Chain Operations', 'Legal Compliance', 'Enterprise Billing')"),
    },
  },
  async ({ agentArchetype, tenantOrganizationName, operationalDomain }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `You are an autonomous agent operating within CTX Bank for the client organization: "${tenantOrganizationName}".
Operational Domain: "${operationalDomain}".
Assigned Archetype: "${agentArchetype}".

You must strictly adhere to the CTX Bank Sovereign Operating Axioms:
1. TRUTH BOUNDARY: Never invent or extrapolate facts. Every assertion must cite verified evidence from CTX Bank.
2. ZERO DIRECT ACTIONS: You do not possess external API tokens, database write privileges, or dispatch credentials. All operations are submitted as typed proposals to the CTX deterministic state engine.
3. POLICY PERIMETER: Adhere strictly to the tenant's configured policy and regulatory boundaries. Never make unauthorized guarantees or un-provable claims.
4. HASH-LOCKED APPROVAL: Any modification to an approved proposal invalidates existing approvals and triggers compliance re-audit.
5. OUTCOME-AS-A-SERVICE: Your performance is benchmarked against verified business outcomes and zero compliance infractions.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  "audit_proposed_action",
  {
    title: "Audit Proposed Action Against CTX Bank Governance",
    description:
      "Evaluates a proposed action or communication against CTX Bank truth boundaries and tenant policies.",
    argsSchema: {
      proposedActionPayload: z.string().describe("The draft payload or action to evaluate"),
      verifiedDossierSummary: z.string().describe("The verified facts established in CTX Bank"),
      tenantPolicySummary: z.string().describe("The policy and regulatory boundaries of the tenant"),
    },
  },
  async ({ proposedActionPayload, verifiedDossierSummary, tenantPolicySummary }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Conduct a rigorous CTX Bank Governance & Truth Boundary Audit:

VERIFIED DOSSIER EVIDENCE:
"""
${verifiedDossierSummary}
"""

TENANT POLICY BOUNDARIES:
"""
${tenantPolicySummary}
"""

PROPOSED ACTION PAYLOAD:
"""
${proposedActionPayload}
"""

AUDIT CRITERIA:
1. Does the payload assert any claims not backed by verified dossier citations?
2. Does the payload breach any tenant policy or regulatory boundaries?
3. Are all required mandatory disclosures and footers present?
4. Final Verdict: PASS, QUARANTINE, or REJECT with specific line citations.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  "assess_instance_launch_readiness",
  {
    title: "Assess Fresh Instance Launch Readiness",
    description:
      "Evaluates whether a newly deployed CTX client instance has completed prerequisite setup before launching live operations.",
    argsSchema: {
      corpusIngestionStatus: z.string().describe("Status of knowledge ingestion in CTX Bank"),
      policyPerimeterLocked: z.boolean().describe("Whether policy boundaries and disclosure footers are recorded"),
      gatewayWriteMode: z.enum(["dry_run", "live"]).describe("Current write mode of external integration gateways"),
      sandboxValidationPassed: z.boolean().describe("Whether sandbox simulation runs have completed successfully"),
    },
  },
  async ({ corpusIngestionStatus, policyPerimeterLocked, gatewayWriteMode, sandboxValidationPassed }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Evaluate fresh instance launch readiness for CTX Bank:

CURRENT STATUS:
- Knowledge Ingestion Status: ${corpusIngestionStatus}
- Policy Perimeter Locked: ${policyPerimeterLocked ? "YES" : "NO"}
- Gateway Write Mode: ${gatewayWriteMode}
- Sandbox Simulation Validation: ${sandboxValidationPassed ? "PASSED" : "PENDING"}

READINESS EVALUATION:
1. Is the truth boundary established? (If NO, production operations must remain blocked).
2. Are policy rules active? (If NO, drafts cannot be certified).
3. Is gateway write mode appropriate? (Recommend dry_run until sandbox validation passes).
4. Provide immediate actionable steps to achieve full production clearance.`,
        },
      },
    ],
  }),
);

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CTX Bank Knowledge Network MCP server running on stdio");
}

main().catch((error) => {
  console.error("CTX Bank MCP server failed to start:", error);
  process.exit(1);
});
