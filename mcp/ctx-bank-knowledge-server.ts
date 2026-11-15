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
// DOMAIN DATA & KNOWLEDGE REPOSITORIES
// ============================================================================

const CTX_BANK_OVERVIEW = {
  name: "CTX Bank (Context Engineering & Autonomous Operations Platform)",
  version: "1.0.0 Pro",
  mission:
    "Bridge the critical enterprise gap between unconstrained, probabilistic LLM agents and regulated high-stakes production workflows through deterministic state engines, evidence-cited truth boundaries, and Outcome-as-a-Service delivery.",
  reach_and_impact: {
    enterprise_deployments: 12,
    sectors: ["Private Capital", "Institutional Wealth Management", "High-Value B2B Financial Syndicates"],
    role: "Core operational backbone powering autonomous deal qualification, compliance-gated LP outreach, and zero-trust CRM synchronization.",
    operating_model: "Outcome-as-a-Service (OaaS) — pricing and performance indexed against verified LP meetings and qualified deal outcomes rather than software seat licenses.",
  },
  core_differentiators: [
    {
      principle: "Evidence-Cited Truth Boundary",
      description: "Agents are strictly bound to an ingested, verifiable knowledge graph and RAG perimeter. If evidence does not exist in the verified dossier, claims cannot be generated or dispatched.",
    },
    {
      principle: "Deterministic Orchestration & Compliance Gating",
      description: "State transitions are governed by deterministic code rather than LLM whims. Outbound drafts require cryptographic hash-matched compliance approvals.",
    },
    {
      principle: "Zero-Trust Integration Security",
      description: "No LLM, agent context, or prompt ever receives CRM or API credentials. All updates pass through a deterministic, fail-closed gateway with append-only SQLite audit logs.",
    },
    {
      principle: "Resilient Persistence Engine",
      description: "WAL-mode SQLite singletons anchored to globalThis survive Next.js Fast Refresh (HMR) and container restarts without connection leakage or data corruption.",
    },
  ],
};

const AGENT_FLEET_SPEC = {
  architecture: "5-Specialized-Agent Fleet with Deterministic State Machine",
  orchestrator_principle:
    "The deterministic workflow engine controls execution, not the language model. Models cannot send mail, alter CRM records, or bypass review gates.",
  agents: [
    {
      name: "Prospect Intelligence Agent",
      role: "Evidence synthesis and dossier briefing",
      responsibilities: [
        "Ingests verified RAG dossiers, company filings, and historical engagement data.",
        "Produces evidence-cited executive briefs for outbound targeting.",
        "Strictly flags missing evidence and refuses to extrapolate unverified claims.",
      ],
      input_boundary: "Canonical RAG dossiers and knowledge graph nodes",
      output_artifact: "Prospect Intelligence Brief with explicit citation hashes",
    },
    {
      name: "Outreach Drafting Agent",
      role: "Context-aware communication drafting",
      responsibilities: [
        "Drafts bespoke initial reactivations, sequence follow-ups, and contextual replies.",
        "Strictly adheres to brand voice, sender credentials (e.g. dylan@aspinvest.co.uk), and approved product positioning.",
        "Never includes booking links in initial unsolicited outreach; links are only dispatched upon explicit inbound prospect interest.",
      ],
      input_boundary: "Intelligence brief + approved product facts + conversation history",
      output_artifact: "Deterministic draft proposal with SHA-256 content hash",
    },
    {
      name: "Conversation Classifier",
      role: "Inbound message intent triage & state routing",
      responsibilities: [
        "Classifies prospect inbound replies into deterministic intents: Interested, Booking Request, Information Query, Opt-Out / Unsubscribe, Complaint, or Out of Scope.",
        "Immediately triggers automated suppression upon detecting opt-out sentiment.",
        "Routes booking confirmations to the signed Cal.com webhook listener.",
      ],
      input_boundary: "Inbound email / message thread",
      output_artifact: "Typed intent classification event + recommended state transition",
    },
    {
      name: "Deliverability Daemon",
      role: "Technical deliverability & hygiene gatekeeper",
      responsibilities: [
        "Validates DNS hygiene (SPF, DKIM, DMARC alignment) for sending domains (e.g. aspinvest.co.uk).",
        "Enforces recipient mailbox validation, syntax verification, and quarantine policies.",
        "Controls throttling, send cadences, and injects signed HMAC open-tracking pixels for engagement analytics.",
        "Monitors bounce and spam complaint rates, halting campaigns if safety thresholds are breached.",
      ],
      input_boundary: "Outbound queue and domain DNS health records",
      output_artifact: "Deliverability clearance token or quarantine classification",
    },
    {
      name: "Compliance Gate",
      role: "Independent regulatory verification & approval lock",
      responsibilities: [
        "Audits the exact text of every outbound draft against regulatory introductions/liaison boundaries.",
        "Verifies that no regulated financial advice or unwarranted return guarantees are communicated.",
        "Binds human operator approvals to the exact SHA-256 hash of the draft; any post-approval edit immediately revokes approval.",
        "Enforces mandatory regulatory footers and sender identity disclosures.",
      ],
      input_boundary: "Final message draft + target jurisdiction rules",
      output_artifact: "Signed compliance approval certificate (pass/quarantine/reject)",
    },
  ],
};

const OAAS_MODEL_GUIDE = {
  title: "Outcome-as-a-Service (OaaS) Operating Blueprint",
  summary:
    "How CTX Bank enables 12 partner enterprises to operate autonomous agent systems monetized on verified business outcomes rather than software subscriptions.",
  key_pillars: [
    {
      pillar: "Outcome-Indexed Economics",
      details:
        "Clients do not pay for user seats or prompt token counts. Contracts are benchmarked against tangible outcomes: verified institutional meetings booked, qualified LP pipeline generated, and compliance-cleared dossier deliveries.",
    },
    {
      pillar: "Dual-Mode Execution (Sandbox vs. Authenticated Operations)",
      details:
        "Every workflow can be run in high-fidelity sandbox simulation (synthetic runs with complete RAG dossiers and mock outboxes) to validate conversion and compliance before switching to authenticated live dispatch.",
    },
    {
      pillar: "Human-in-the-Loop Cockpit",
      details:
        "Operators use Mission Control and Agent OS Tracker to govern fleets of 100+ simultaneous conversations. The machine handles 95% of intelligence gathering and drafting, while human operators retain final authorization on consequential actions.",
    },
    {
      pillar: "Multi-Tenant Enterprise Isolation",
      details:
        "Each partner enterprise maintains isolated SQLite WAL databases, dedicated RAG indexes, custom CRM field mappings, and independent deliverability infrastructure, preventing cross-tenant data contamination.",
    },
  ],
};

const COMPLIANCE_AND_REGULATORY_MATRIX = {
  regulatory_framework: "FCA Introducer & Commercial Liaison Perimeter",
  core_mandates: [
    {
      rule: "Introducer vs. Advice Boundary",
      requirement:
        "Agents must strictly act as commercial introducers/information liaisons. They must NEVER provide financial advice, make personalized investment recommendations, or promise specific returns.",
    },
    {
      rule: "Cryptographic Hash-Bound Approval",
      requirement:
        "Operator approvals are bound to the SHA-256 hash of the message content. Modifying even a single character invalidates the approval and requires re-verification by the Compliance Gate.",
    },
    {
      rule: "Deterministic Suppression",
      requirement:
        "Any opt-out, 'remove me', or negative sentiment trigger immediately suppresses the contact across all workflows and syncs a suppression flag to the CRM.",
    },
    {
      rule: "Explicit Provenance & Evidence Citation",
      requirement:
        "Every claim made about an investment product, yield, asset class, or track record must reference a verified source document chunk in the canonical knowledge repository.",
    },
  ],
};

const ZERO_TRUST_CRM_MATRIX = {
  architecture: "Zero-Trust Fail-Closed Gateway Pattern",
  principles: [
    "No AI agent or LLM prompt ever receives or has access to HubSpot API keys, OAuth refresh tokens, or CRM admin credentials.",
    "Updates are initiated solely via structured workflow events emitted by the deterministic engine.",
    "Fixed allowlists restrict CRM writes to designated pilot cohorts (e.g. 25-lead pilot).",
    "Append-only SQLite audit log (hubspot_audit.sqlite) records every payload, timestamp, and status code with zero secret leakage.",
    "Fail-closed kill-switch: if HUBSPOT_WRITES_ENABLED !== 'true', all mutations are safely simulated and logged as dry-run audit records.",
    "Cal.com calendar integration uses HMAC-SHA256 signature verification on inbound webhooks to prevent spoofed meeting confirmations.",
  ],
  permitted_operations: [
    "PATCH /crm/v3/objects/contacts/:id — Only strict allowlisted custom properties (e.g. ctx_email_opened, outreach_stage).",
    "POST /crm/v3/objects/notes — Compliance-audited interaction summaries.",
    "POST /crm/v3/objects/emails — Logging dispatched messages with tracking metadata.",
  ],
};

const ARCHITECTURE_DEEP_DIVES: Record<string, string> = {
  "runtime-engine": `
### CTX Runtime Engine
The CTX runtime engine is a deterministic workflow runner implemented in TypeScript with Node.js and Next.js App Router.
- State machines handle transitions across: queued -> generating_brief -> drafting -> compliance_review -> awaiting_approval -> approved -> dispatched -> tracking_reply -> booking_completed.
- Retries use exponential backoff with lease locks to prevent split-brain execution across multiple worker threads.
- Event streams (Server-Sent Events) deliver real-time progress updates to the Mission Control dashboard.
  `,
  "sqlite-wal-singletons": `
### SQLite WAL Singletons & HMR Resilience
Next.js Hot Module Replacement (HMR) re-evaluates modules on code changes, which can leak open SQLite file descriptors.
- CTX Bank attaches all SQLite database singletons to 'globalThis' (e.g. globalThis.__ctxOutreachStore, globalThis.__ctxHubSpotGateway).
- Pragmas configured: 'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;'.
- Result: 100% immune to dev server state-locks and connection exhaustion.
  `,
  "rag-perimeter": `
### Knowledge Graph & RAG Perimeter
The knowledge network incorporates a multi-hop typed relationship graph (entities, concepts, documents, evidence).
- Document ingestion extracts text, splits chunks, generates semantic embeddings, and creates derived graph nodes with 'authority' and 'confidence' ratings.
- Search traverses both direct vector cosine similarity and 1-3 hop neighborhood graph relationships.
- Guarantees that agent-generated drafts cite concrete source chunk IDs.
  `,
  "deliverability-daemon": `
### Deliverability Daemon & Tracking
The deliverability subsystem ensures high-reputation inbox placement:
- Proactive validation of SPF, DKIM, and DMARC records on sending domains.
- Bounce-rate threshold monitoring with automated circuit breakers.
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
      "Retrieve the high-level architecture, mission, ecosystem impact, and Outcome-as-a-Service (OaaS) reach of CTX Bank.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(CTX_BANK_OVERVIEW),
);

server.registerTool(
  "get_agent_fleet_spec",
  {
    title: "Get 5-Agent Fleet Specifications",
    description:
      "Retrieve detailed role specifications, input/output boundaries, and execution rules for the 5 CTX Bank specialized agents.",
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
        .describe("Specific agent to inspect, or 'all' for the entire fleet"),
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
    return result(match ?? { error: "Agent not found", requested: agentName });
  },
);

server.registerTool(
  "get_oaas_model_guide",
  {
    title: "Get Outcome-as-a-Service (OaaS) Operating Guide",
    description:
      "Retrieve the business model, commercial pricing strategy, and multi-tenant operational guidelines for CTX Bank's OaaS framework.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(OAAS_MODEL_GUIDE),
);

server.registerTool(
  "get_compliance_matrix",
  {
    title: "Get Regulatory & Compliance Rules",
    description:
      "Retrieve the regulatory introducer perimeter, hash-bound approval protocol, and evidence citation standards.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(COMPLIANCE_AND_REGULATORY_MATRIX),
);

server.registerTool(
  "get_crm_zero_trust_matrix",
  {
    title: "Get Zero-Trust CRM & Integration Architecture",
    description:
      "Retrieve the security rules, allowlists, and fail-closed gateway specifications for HubSpot CRM and Cal.com integrations.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(ZERO_TRUST_CRM_MATRIX),
);

server.registerTool(
  "query_ctx_architecture",
  {
    title: "Query CTX Bank Technical Architecture",
    description:
      "Retrieve in-depth technical documentation on CTX Bank subsystems (runtime-engine, sqlite-wal-singletons, rag-perimeter, deliverability-daemon).",
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
    name: "system-overview",
    uri: "ctx://bank/system-overview",
    description: "CTX Bank architectural overview and ecosystem reach",
    data: CTX_BANK_OVERVIEW,
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
    data: COMPLIANCE_AND_REGULATORY_MATRIX,
  },
  {
    name: "crm-zero-trust",
    uri: "ctx://bank/crm-zero-trust",
    description: "Zero-trust fail-closed CRM gateway and audit specifications",
    data: ZERO_TRUST_CRM_MATRIX,
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
  "ctx_agent_system_prompt",
  {
    title: "Generate CTX Fleet System Prompt",
    description:
      "Generates an iron-clad system prompt for an autonomous agent operating within the CTX Bank ecosystem.",
    argsSchema: {
      agentRole: z
        .string()
        .describe("The role to assume (e.g. 'Prospect Intelligence', 'Outreach Drafter', 'Compliance Officer')"),
      clientName: z.string().default("ASP Private Capital").describe("Enterprise client name"),
    },
  },
  async ({ agentRole, clientName }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `You are an autonomous agent operating within the CTX Bank platform on behalf of ${clientName}.
Your designated role: ${agentRole}.

You must strictly obey the following CTX Bank Sovereign Operating Directives:
1. TRUTH BOUNDARY: Never invent or extrapolate facts. Every claim must cite verified evidence from the provided dossier.
2. ZERO DIRECT ACTIONS: You do not possess external API tokens, email dispatches, or CRM write privileges. All operations are submitted as typed proposals to the deterministic workflow engine.
3. COMPLIANCE & BOUNDARIES: Never provide financial advice, performance guarantees, or solicit unregistered investments. Act solely within authorized introducer boundaries.
4. CAL.COM BOOKING RULE: Never dispatch a scheduling link on initial cold contact. Booking links are strictly restricted to interested inbound follow-ups.
5. HASH LOCK: Any draft modifications trigger automated compliance re-evaluation.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  "evaluate_outreach_compliance",
  {
    title: "Evaluate Outreach Compliance",
    description:
      "Reviews an outreach draft against the regulatory introducer perimeter and CTX compliance rules.",
    argsSchema: {
      draftText: z.string().describe("The draft message text to evaluate"),
      prospectDossierSummary: z.string().describe("The facts established in the verified dossier"),
    },
  },
  async ({ draftText, prospectDossierSummary }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please conduct a rigorous CTX Bank Compliance Audit on the following outreach draft:

PROSPECT VERIFIED DOSSIER:
"""
${prospectDossierSummary}
"""

PROPOSED OUTREACH DRAFT:
"""
${draftText}
"""

AUDIT CHECKLIST:
1. Does the draft contain any unsubstantiated claims not present in the dossier?
2. Does the draft offer regulated financial advice or guarantee investment performance?
3. If this is an initial message, does it improperly contain a booking link or calendar invite?
4. Are appropriate introducer disclosures and sender identification maintained?
5. Verdict: PASS, QUARANTINE, or REJECT with specific line citations.`,
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
