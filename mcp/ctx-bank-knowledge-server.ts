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
// CTX & CTX BANK PLATFORM REPOSITORY (CLIENT-AGNOSTIC / FRESH-STATE READY)
// ============================================================================

const CTX_PLATFORM_MANIFEST = {
  platform: "CTX (Context Engineering & Autonomous Operations Platform)",
  core_engine: "CTX Bank (The Sovereign Context Bank & Agent Operating System)",
  version: "1.0.0 Pro Enterprise",
  purpose:
    "Provide a deterministic, evidence-grounded runtime and sovereign context repository that bridges the gap between probabilistic LLMs and high-consequence enterprise operations.",
  ecosystem_reach: {
    deployments: "Powering dedicated autonomous agent systems across 12+ enterprise partner instances",
    sectors: ["Private Capital & Asset Management", "Institutional Wealth Syndicates", "Regulated B2B Financial Services"],
    business_model: "Outcome-as-a-Service (OaaS) — client value and operational performance are measured and monetized by verified business outcomes (e.g., qualified investor meetings, compliance-cleared transactions) rather than software seat licenses.",
  },
  fundamental_axioms: [
    {
      axiom: "Evidence-Cited Truth Boundary",
      rule: "Agents are strictly bounded to the verified knowledge corpus in CTX Bank. An agent must never invent, extrapolate, or assert claims lacking verifiable source provenance.",
    },
    {
      axiom: "Deterministic State Machine Execution",
      rule: "All consequential state transitions (outreach, dispatch, state updates) are governed by deterministic code and state machines. The LLM is an intelligence generator, not the workflow controller.",
    },
    {
      axiom: "Immutable Compliance & Hash-Locked Approval",
      rule: "Every outbound communication requires a passing compliance review. Human approvals are cryptographically bound to the SHA-256 hash of the exact draft; any modification immediately revokes approval.",
    },
    {
      axiom: "Zero-Trust External Gateways",
      rule: "No LLM, agent prompt, or background task ever receives raw external credentials (CRM keys, SMTP passwords, API tokens). All operations pass through fail-closed, allowlist-bounded micro-gateways with append-only SQLite audit trails.",
    },
    {
      axiom: "Resilient Storage & Isolation",
      rule: "Each client instance maintains isolated SQLite WAL singletons anchored to globalThis, preventing Fast-Refresh / HMR connection leaks, lock contention, or cross-tenant data bleed.",
    },
  ],
};

const FRESH_INSTANCE_ORIENTATION = {
  title: "CTX Bank Fresh-Instance Bootstrapping Guide for Autonomous Agents",
  intent:
    "Provided alongside fresh-state deployments so newly initialized agents immediately recognize their role, operational boundaries, and system dependencies upon loading.",
  agent_mental_model: [
    "You are operating inside a sovereign CTX instance powered by CTX Bank.",
    "Upon initial wake-up in a fresh deployment, no domain assumptions should be made. You must discover the client's ingested knowledge corpus, brand guidelines, and configured integrations dynamically.",
    "You do not have direct access to send emails, update CRMs, or execute transactions. You propose structured actions to the CTX workflow engine.",
    "Your objective is to deliver guaranteed business outcomes under an Outcome-as-a-Service (OaaS) contract with zero compliance infractions.",
  ],
  fresh_instance_checklist: [
    {
      step: 1,
      phase: "Knowledge Ingestion & Corpus Discovery",
      action: "Verify that canonical client documents, dossiers, and product information have been ingested into CTX Bank's graph and RAG perimeters.",
      status_check: "Query knowledge nodes and document extraction status via CTX Bank repository.",
    },
    {
      step: 2,
      phase: "Integration & Gateway Verification",
      action: "Confirm fail-closed integration posture. Ensure CRM write switches (e.g. HUBSPOT_WRITES_ENABLED) are intentionally configured (dry-run vs. live).",
      status_check: "Inspect audit log tables (e.g. hubspot_audit.sqlite) for clean initialization.",
    },
    {
      step: 3,
      phase: "Deliverability Hygiene Check",
      action: "Verify sending domain DNS authentication (SPF, DKIM, DMARC) through the Deliverability Daemon before attempting live communication.",
      status_check: "Check domain alignment and warm-up rate limits.",
    },
    {
      step: 4,
      phase: "Compliance Baseline Lock",
      action: "Ensure client-specific regulatory boundaries (e.g., commercial introducer vs. licensed advice) and required disclosure footers are recorded.",
      status_check: "Validate that draft review rejects any communication lacking evidence citations or mandatory footers.",
    },
    {
      step: 5,
      phase: "Sandbox Simulation Run",
      action: "Execute initial campaigns in simulated sandbox mode (synthetic outbox, mock CRM updates) to verify conversation trajectories end-to-end before enabling production dispatch.",
      status_check: "Review sandbox audit events and approval workflows in Mission Control.",
    },
  ],
};

const AGENT_FLEET_SPEC = {
  architecture: "5-Specialized-Agent Fleet Architecture",
  description:
    "CTX Bank organizes autonomous operations into five decoupled, specialized agent archetypes governed by a central state orchestrator.",
  agents: [
    {
      name: "Prospect Intelligence Agent",
      archetype: "evidence_synthesis",
      responsibilities: [
        "Ingests verified RAG dossiers, company filings, and historical engagement data from CTX Bank.",
        "Synthesizes evidence-cited briefs detailing prospect context, key drivers, and relevance.",
        "Strictly flags missing evidence and refuses to extrapolate unverified claims.",
      ],
      input_boundary: "Canonical RAG dossiers and CTX Bank knowledge nodes",
      output_artifact: "Prospect Intelligence Brief with explicit citation hashes",
    },
    {
      name: "Outreach Drafting Agent",
      archetype: "communication_generation",
      responsibilities: [
        "Drafts bespoke initial reactivations, sequence follow-ups, and contextual responses.",
        "Adheres strictly to the tenant's brand voice, designated sender profile, and approved product claims.",
        "Strict Rule: NEVER includes booking or calendar links in initial unsolicited outreach. Booking links are strictly restricted to interested inbound follow-ups.",
      ],
      input_boundary: "Intelligence brief + approved product facts + conversation thread",
      output_artifact: "Deterministic draft proposal with SHA-256 content hash",
    },
    {
      name: "Conversation Classifier",
      archetype: "intent_triage",
      responsibilities: [
        "Evaluates inbound prospect replies and assigns deterministic intents: Interested, Booking Request, Information Query, Opt-Out / Unsubscribe, Complaint, or Out of Scope.",
        "Immediately triggers automated suppression upon detecting opt-out sentiment.",
        "Routes booking intent to signed scheduling webhooks (e.g. Cal.com) with unique, secure links.",
      ],
      input_boundary: "Inbound communication thread",
      output_artifact: "Typed intent classification event + recommended state machine transition",
    },
    {
      name: "Deliverability Daemon",
      archetype: "technical_hygiene_gate",
      responsibilities: [
        "Verifies sending domain DNS records (SPF, DKIM, DMARC alignment).",
        "Enforces recipient mailbox validation, syntax checking, and quarantine policies.",
        "Manages sending rate limits, throttling schedules, and injects signed HMAC open-tracking tokens.",
        "Halts campaigns automatically if bounce or complaint rates exceed safety thresholds.",
      ],
      input_boundary: "Outbound message queue and domain DNS health metrics",
      output_artifact: "Deliverability clearance token or quarantine classification",
    },
    {
      name: "Compliance Gate",
      archetype: "regulatory_verification",
      responsibilities: [
        "Audits every outbound message draft against jurisdiction-specific regulatory boundaries (e.g., commercial introducer vs. regulated investment advice).",
        "Confirms that no unauthorized performance promises or unverified claims are present.",
        "Binds human operator approvals to the exact SHA-256 hash of the draft; any post-approval edit revokes approval immediately.",
        "Enforces mandatory regulatory disclosures, opt-out notices, and sender identity footers.",
      ],
      input_boundary: "Final message draft + regulatory perimeter rules",
      output_artifact: "Signed compliance approval certificate (pass/quarantine/reject)",
    },
  ],
};

const OAAS_MODEL_GUIDE = {
  title: "Outcome-as-a-Service (OaaS) Operating Blueprint",
  summary:
    "CTX Bank is architected as an Outcome-as-a-Service system. Rather than licensing software seats, deployments are designed to autonomously deliver, track, and guarantee high-value business outcomes.",
  operating_principles: [
    {
      principle: "Outcome-Indexed Commercials",
      description:
        "The client value metric is verified business outcomes: qualified LP meetings booked, institutional pipeline generated, compliance-audited dossiers delivered.",
    },
    {
      principle: "Autonomous Execution with Human-in-the-Loop Safeguards",
      description:
        "The agent fleet autonomously handles 95% of intelligence gathering, drafting, classification, and deliverability monitoring. Consequential external actions (sending emails, modifying records) remain governed by explicit human approval or pre-cleared compliance policies.",
    },
    {
      principle: "Dual-Mode Sandboxing",
      description:
        "Every campaign can run in sandbox simulation mode (retaining real dossiers but routing to synthetic outboxes and mock CRM audit events) before toggling to production delivery.",
    },
    {
      principle: "Sovereign Multi-Tenant Isolation",
      description:
        "Each client instance operates with isolated database files, independent vector indices, dedicated sender domains, and private audit trails, ensuring zero cross-tenant data contamination.",
    },
  ],
};

const COMPLIANCE_GOVERNANCE_MATRIX = {
  framework: "CTX Sovereign Regulatory & Governance Engine",
  rules: [
    {
      rule: "Introducer & Liaison Perimeter",
      requirement:
        "Agents must strictly maintain the role of an informational liaison or commercial introducer. Under no circumstances may an agent provide personalized investment advice, financial planning, or guaranteed return projections.",
    },
    {
      rule: "SHA-256 Hash Lock Protocol",
      requirement:
        "Operator approvals are mathematically bound to the SHA-256 digest of the outbound message text. If an operator or agent changes a single character, the approval is voided and must be re-evaluated.",
    },
    {
      rule: "Immediate Opt-Out Suppression",
      requirement:
        "Any inbound communication expressing a desire to opt out or unsubscribe must immediately trigger permanent suppression across all campaigns and sync to the CRM.",
    },
    {
      rule: "Verifiable Citation Requirement",
      requirement:
        "All factual statements regarding track records, fund metrics, product features, or personnel must be cited directly to an ingested document node in CTX Bank.",
    },
  ],
};

const ZERO_TRUST_INTEGRATION_RULES = {
  architecture: "Zero-Trust Fail-Closed Gateway Pattern",
  principles: [
    "No agent, LLM prompt, or background task ever receives raw external credentials (CRM API tokens, calendar secrets, SMTP credentials).",
    "CRM mutations are initiated exclusively via structured events emitted by the deterministic workflow engine.",
    "Strict allowlists limit CRM updates to pre-authorized cohort IDs during onboarding and pilot phases.",
    "Append-only SQLite audit logs record every payload, timestamp, and response code with zero credential leakage.",
    "Fail-closed default: if write switches are not explicitly enabled ('true'), mutations are safely simulated and recorded as dry-run audit entries.",
    "Signed Webhooks: Scheduling events (e.g. Cal.com) are validated using HMAC-SHA256 signatures to prevent spoofed appointment confirmations.",
  ],
  permitted_operations: [
    "PATCH /crm/v3/objects/contacts/:id — Restricted strictly to allowlisted properties (e.g. outreach stage, email opened).",
    "POST /crm/v3/objects/notes — Audited interaction summaries.",
    "POST /crm/v3/objects/emails — Dispatched message logging with engagement tokens.",
  ],
};

const ARCHITECTURE_DEEP_DIVES: Record<string, string> = {
  "runtime-engine": `
### CTX Deterministic Runtime Engine
- State machines govern transitions across: queued -> generating_brief -> drafting -> compliance_review -> awaiting_approval -> approved -> dispatched -> tracking_reply -> booking_completed.
- Bounded retries, exponential backoff, and lease-lock scheduling prevent race conditions and duplicate operations.
- Real-time Server-Sent Events (SSE) stream operational progress directly to operator dashboards.
  `,
  "sqlite-wal-singletons": `
### SQLite WAL Singletons & Fast-Refresh Resilience
- In Next.js environments, Hot Module Replacement (HMR) re-evaluates modules, which can leak open SQLite file descriptors.
- CTX Bank binds all SQLite database instances to 'globalThis' (e.g. globalThis.__ctxOutreachStore, globalThis.__ctxHubSpotGateway).
- Pragmas configured: 'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;'.
- Guarantees 100% immunity to dev-server state locks and connection exhaustion in persistent production environments.
  `,
  "rag-perimeter": `
### CTX Bank Knowledge Graph & RAG Perimeter
- Combines vector embeddings with a multi-hop typed relationship graph (nodes: concepts, entities, sources, evidence).
- Document ingestion extracts text, builds chunks, tags source authority, and computes cryptographic source hashes.
- Search traverses both cosine similarity and 1-3 hop neighborhood relationships to ensure high-precision contextual grounding.
  `,
  "deliverability-daemon": `
### Deliverability Daemon & Engagement Tracking
- Proactive validation of SPF, DKIM, and DMARC DNS health for sending domains.
- Recipient email address syntax verification and bounce-risk scoring.
- Injects zero-pixel transparent GIF tracking tokens with HMAC signatures (e.g. /api/track/open/[token]) to verify email reads without exposing recipient email addresses.
  `,
};

// ============================================================================
// TOOLS REGISTRATION
// ============================================================================

server.registerTool(
  "get_ctx_bank_overview",
  {
    title: "Get CTX Bank Platform Overview",
    description:
      "Retrieve the core purpose, mission, fundamental axioms, and Outcome-as-a-Service (OaaS) reach of CTX and CTX Bank across 12+ enterprise deployments.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(CTX_PLATFORM_MANIFEST),
);

server.registerTool(
  "get_fresh_instance_orientation",
  {
    title: "Get Fresh-Instance Bootstrapping Orientation",
    description:
      "Essential guide for an agent waking up in a fresh-state CTX deployment. Outlines mental models, onboarding phases, and operational prerequisites.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(FRESH_INSTANCE_ORIENTATION),
);

server.registerTool(
  "get_agent_fleet_spec",
  {
    title: "Get 5-Agent Fleet Specifications",
    description:
      "Inspect role definitions, responsibilities, input/output perimeters, and execution constraints for the 5 CTX Bank specialized agent archetypes.",
    inputSchema: {
      agentName: z
        .enum([
          "all",
          "prospect_intelligence",
          "outreach_drafting",
          "conversation_classifier",
          "deliverability_daemon",
          "compliance_gate",
        ])
        .default("all")
        .describe("Specific agent archetype to inspect, or 'all' for the full fleet"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ agentName }) => {
    if (agentName === "all") return result(AGENT_FLEET_SPEC);
    const keyMap: Record<string, string> = {
      prospect_intelligence: "Prospect Intelligence Agent",
      outreach_drafting: "Outreach Drafting Agent",
      conversation_classifier: "Conversation Classifier",
      deliverability_daemon: "Deliverability Daemon",
      compliance_gate: "Compliance Gate",
    };
    const targetTitle = keyMap[agentName];
    const match = AGENT_FLEET_SPEC.agents.find((a) => a.name === targetTitle);
    return result(match ?? { error: "Agent archetype not found", requested: agentName });
  },
);

server.registerTool(
  "get_oaas_model_guide",
  {
    title: "Get Outcome-as-a-Service (OaaS) Operating Guide",
    description:
      "Retrieve the commercial model, outcome benchmarking, dual-mode sandboxing, and sovereign multi-tenant isolation guidelines of CTX Bank.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(OAAS_MODEL_GUIDE),
);

server.registerTool(
  "get_compliance_matrix",
  {
    title: "Get Compliance & Regulatory Governance Matrix",
    description:
      "Retrieve the introducer perimeter, cryptographic SHA-256 approval hash protocol, and opt-out suppression rules.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(COMPLIANCE_GOVERNANCE_MATRIX),
);

server.registerTool(
  "get_crm_zero_trust_matrix",
  {
    title: "Get Zero-Trust CRM & External Integration Rules",
    description:
      "Retrieve the fail-closed gateway specifications, allowlist policies, and signed webhook validation requirements for external integrations.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(ZERO_TRUST_INTEGRATION_RULES),
);

server.registerTool(
  "query_ctx_architecture",
  {
    title: "Query CTX Bank Technical Architecture Subsystems",
    description:
      "Inspect in-depth technical documentation on CTX Bank subsystems (runtime-engine, sqlite-wal-singletons, rag-perimeter, deliverability-daemon).",
    inputSchema: {
      subsystem: z.enum([
        "runtime-engine",
        "sqlite-wal-singletons",
        "rag-perimeter",
        "deliverability-daemon",
      ]),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ subsystem }) => {
    const doc = ARCHITECTURE_DEEP_DIVES[subsystem];
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
    name: "fresh-instance-guide",
    uri: "ctx://bank/fresh-instance-guide",
    description: "Step-by-step onboarding guide for agents initializing in a fresh deployment",
    data: FRESH_INSTANCE_ORIENTATION,
  },
  {
    name: "5-agent-spec",
    uri: "ctx://bank/5-agent-spec",
    description: "Full specifications and boundaries for the 5-agent fleet",
    data: AGENT_FLEET_SPEC,
  },
  {
    name: "oaas-playbook",
    uri: "ctx://bank/oaas-playbook",
    description: "Outcome-as-a-Service operational playbook and commercial design",
    data: OAAS_MODEL_GUIDE,
  },
  {
    name: "compliance-matrix",
    uri: "ctx://bank/compliance-matrix",
    description: "Regulatory introducer boundaries and hash-gated approval rules",
    data: COMPLIANCE_GOVERNANCE_MATRIX,
  },
  {
    name: "zero-trust-integrations",
    uri: "ctx://bank/zero-trust-integrations",
    description: "Zero-trust fail-closed CRM gateway and audit specifications",
    data: ZERO_TRUST_INTEGRATION_RULES,
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
  "ctx_agent_bootstrap_prompt",
  {
    title: "Bootstrap New Agent in Fresh CTX Instance",
    description:
      "Conditions a newly initialized agent with the universal CTX Bank operating directives, evidence truth boundaries, and tenant isolation rules.",
    argsSchema: {
      agentRole: z
        .string()
        .describe("The role being assigned to this agent (e.g. 'Prospect Intelligence', 'Outreach Drafter', 'Deliverability Guardian')"),
      tenantOrganizationName: z
        .string()
        .describe("The name of the enterprise client organization operating this CTX instance"),
    },
  },
  async ({ agentRole, tenantOrganizationName }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `You are an autonomous agent operating within CTX Bank for the client organization: "${tenantOrganizationName}".
Your assigned role: ${agentRole}.

You must strictly obey the following CTX Bank Sovereign Operating Directives:
1. TRUTH BOUNDARY: Never invent or extrapolate facts. Every claim must cite verified evidence from CTX Bank.
2. ZERO DIRECT ACTIONS: You do not possess external API tokens, email dispatches, or CRM write privileges. All operations are submitted as typed proposals to the deterministic workflow engine.
3. COMPLIANCE & BOUNDARIES: Never provide regulated financial advice or unwarranted performance guarantees. Act solely within authorized commercial liaison boundaries.
4. CALENDAR SCHEDULING RULE: Never dispatch a scheduling link on initial cold contact. Booking links are strictly restricted to interested inbound follow-ups.
5. HASH LOCK: Modifying any draft invalidates existing approvals and triggers compliance re-audit.
6. OUTCOME-AS-A-SERVICE: Your performance is benchmarked against verified business outcomes and zero compliance infractions.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  "verify_fresh_instance_readiness",
  {
    title: "Verify Fresh Instance Readiness",
    description:
      "Evaluates whether a newly deployed CTX client instance has completed prerequisite setup before launching campaigns.",
    argsSchema: {
      hasIngestedCorpus: z.boolean().describe("Whether knowledge documents have been uploaded and processed into the graph"),
      dnsHygieneVerified: z.boolean().describe("Whether SPF/DKIM/DMARC records are confirmed for the sending domain"),
      crmWriteMode: z.enum(["dry_run", "live"]).describe("Current write mode of the CRM integration gateway"),
    },
  },
  async ({ hasIngestedCorpus, dnsHygieneVerified, crmWriteMode }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Evaluate fresh instance launch readiness for CTX Bank:

CURRENT STATUS:
- Knowledge Corpus Ingested: ${hasIngestedCorpus ? "YES" : "NO"}
- Domain DNS Hygiene (SPF/DKIM/DMARC) Verified: ${dnsHygieneVerified ? "YES" : "NO"}
- CRM Gateway Write Mode: ${crmWriteMode}

AUDIT CHECKLIST:
1. Is the truth boundary established? (If NO, campaigns MUST be blocked).
2. Is domain reputation protected? (If NO, email dispatch MUST remain simulated).
3. Is CRM write mode intentional? (Recommend dry_run for initial cohort).
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
