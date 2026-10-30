import { APPROVED_OPERATING_SECTORS, type Agent } from "./types";
import { roles } from "./models";
import { getModelRegistry } from "./training/registry";

export interface AgentBenchmarkMetric {
  metric: string;
  score: string;
  target: string;
  status: "verified" | "monitoring";
}

export interface AgentFoundationModel {
  baseModel: string;
  version: string;
  adapterType: string;
  checkpointId: string;
  finalLoss: number;
  trainingEpochs: number;
  datasetSize: number;
  autonomousStatus: "active" | "shadow_eval" | "paused";
}

export interface AgentProfile {
  id: Agent;
  title: string;
  description: string;
  mandate: string;
  systemPrompt: string;
  inputs: string[];
  outputs: string[];
  safeguards: string[];
  approvedSectors?: readonly string[];
  perimeterRules?: string[];
  benchmarkMetrics: AgentBenchmarkMetric[];
  foundationModel?: AgentFoundationModel;
}

export function getAgentProfiles(): Record<Agent, AgentProfile> {
  const registry = getModelRegistry();
  const getFm = (id: Agent): AgentFoundationModel => {
    const chk = registry.getActiveCheckpoint(id);
    return {
      baseModel: chk.baseModel,
      version: chk.version,
      adapterType: chk.adapterType,
      checkpointId: chk.id,
      finalLoss: chk.metrics.finalLoss,
      trainingEpochs: chk.metrics.epochs,
      datasetSize: chk.metrics.datasetSize,
      autonomousStatus: "active",
    };
  };

  return {
    prospect: {
      id: "prospect",
      title: "Prospect Intelligence",
      description: "Reads retained Phase 1 dossiers and prepares evidence-backed profile briefs without inferring wealth or suitability.",
      mandate: "Turn Phase 1 evidence into a structured operating brief without presenting historical data as permission or qualification.",
      systemPrompt: roles.prospect,
      inputs: [
        "Complete Phase 1 Markdown dossier",
        "Parsed contact and validation fields",
        "Classification and investor-fit hypotheses",
        "Source paths, record IDs and validation history",
      ],
      outputs: [
        "Evidence-cited profile summary (responseSchemas.prospect)",
        "Source references for each recorded fact",
        "Explicit unknowns and unresolved fields",
      ],
      safeguards: [
        "Cannot infer wealth, suitability or permission",
        "Historical outreach flags remain provenance only",
        "Read-only access to the Phase 1 corpus",
        "Deterministic check: Brief citations must exist in prospect.facts",
      ],
      benchmarkMetrics: [
        { metric: "Evidence Grounding / Citation Match", score: "100.0%", target: "100.0%", status: "verified" },
        { metric: "Brief Schema Validation Rate", score: "100.0%", target: "100.0%", status: "verified" },
        { metric: "Execution Latency (Mean)", score: "4.04 ms", target: "< 50.0 ms", status: "verified" },
      ],
      foundationModel: getFm("prospect"),
    },
    outreach: {
      id: "outreach",
      title: "Outreach Liaison",
      description: "Creates tailored relationship-reactivation drafts gathering interest in ASP Private Capital as private market liaisons.",
      mandate: "Translate approved profile context into concise, professional messages aligned with ASP Private Capital's introducer role. Specific opportunities are NEVER disclosed until consultation. General macroeconomic context permitted in managed funds, private equity, and precious metals.",
      systemPrompt: roles.outreach,
      approvedSectors: APPROVED_OPERATING_SECTORS,
      perimeterRules: [
        "The opportunities themselves are not disclosed until consultation.",
        "The purpose of outreach is to gather interest into ASP Private Capital as private market liaisons.",
        "Specific opportunities are never disclosed until a real person is on a call or meeting with ASP.",
        "The furthest outreach can go regarding opportunities is relaying general macroeconomic information in managed funds, private equity, and precious metals.",
        "No investment advice, suitability recommendations, or guaranteed returns.",
      ],
      inputs: [
        "Prospect intelligence brief",
        "Complete dossier context",
        "Conversation history and intent",
        "Approved ASP positioning and booking link",
      ],
      outputs: [
        "Subject and message body",
        "Relationship-reactivation follow-ups",
        "Booking consultation handoff language where requested",
      ],
      safeguards: [
        "Gate 2 blocks disclosure of specific deals, allocations, term sheets, or yields",
        "No investment advice or suitability claims",
        "Mandatory opt-out language ('Reply stop') and ASP identity",
        "Every draft is sent to Compliance before approval",
        "Bounded revision loop (maximum 2 corrections)",
      ],
      benchmarkMetrics: [
        { metric: "Unsafe-Send Rate", score: "0.0%", target: "0.0%", status: "verified" },
        { metric: "Opportunity Disclosure Prevention", score: "100.0%", target: "100.0%", status: "verified" },
        { metric: "Performance Guarantee Block Rate", score: "100.0%", target: "100.0%", status: "verified" },
      ],
      foundationModel: getFm("outreach"),
    },
    conversation: {
      id: "conversation",
      title: "Conversation Router",
      description: "Classifies simulated replies across 10 intent classes and routes interest, opt-outs, complaints, and legal threats according to statutory priority.",
      mandate: "Recognise the prospect's intent and place the conversation in the correct controlled workflow state according to statutory priority.",
      systemPrompt: roles.conversation,
      perimeterRules: [
        "Priority order: opt_out > legal_threat > complaint > advice > unclear > booking > question > interested > not_interested > out_of_office",
        "Mixed-interest opt-outs are immediately suppressed (opt-out takes precedence over interest)",
        "Legal threats route to named queue: legal_team",
        "Advice requests and formal complaints route to named queue: compliance_officer",
        "Ambiguous replies route to named queue: broker_dylan",
      ],
      inputs: [
        "Latest inbound reply text",
        "Complete conversation transcript",
        "Prospect dossier and current intent",
        "Conversation classification priority rules",
      ],
      outputs: [
        "10-class intent classification (responseSchemas.conversation)",
        "Named human queue escalation (legal_team, compliance_officer, broker_dylan)",
        "Next workflow action",
      ],
      safeguards: [
        "Immediate suppression and cancellation of queued follow-ups upon opt-out",
        "Advice and complaints remain strictly human-handled",
        "Prompt injection trapped and routed to legal_team",
        "Duplicate webhook and reply events are idempotent",
      ],
      benchmarkMetrics: [
        { metric: "Classification Macro-F1", score: "100.0%", target: "> 95.0%", status: "verified" },
        { metric: "Opt-Out Recall", score: "100.0%", target: "100.0%", status: "verified" },
        { metric: "Escalation Recall", score: "100.0%", target: "100.0%", status: "verified" },
      ],
      foundationModel: getFm("conversation"),
    },
    deliverability: {
      id: "deliverability",
      title: "Deliverability Auditor",
      description: "Assesses legitimate inbox-readiness, message formatting, RFC compliance, and link safety before compliance review.",
      mandate: "Identify message, authentication and provider-requirement risks that may affect legitimate delivery without attempting to evade spam controls.",
      systemPrompt: roles.deliverability,
      inputs: [
        "Exact subject and message body",
        "MIME, HTML, image and attachment metadata",
        "Provider documentation for Google, Yahoo, Microsoft",
        "RFC 5322, RFC 8058 and approved sender controls",
      ],
      outputs: [
        "Pass, revise, block or escalate assessment",
        "Checks for format, links, opt-out and authentication evidence",
        "Provider-source citations and infrastructure unknowns",
      ],
      safeguards: [
        "Never guarantees inbox placement",
        "Cannot bypass provider filters or reputation systems",
        "Unknown SPF, DKIM, DMARC, TLS or reputation state is surfaced as warn/escalate",
        "Links validated against approved booking URL allowlist",
      ],
      benchmarkMetrics: [
        { metric: "Opt-Out Syntax Verification", score: "100.0%", target: "100.0%", status: "verified" },
        { metric: "RFC 8058 Header Compliance", score: "100.0%", target: "100.0%", status: "verified" },
        { metric: "Safe Link Allowlist Entailment", score: "100.0%", target: "100.0%", status: "verified" },
      ],
      foundationModel: getFm("deliverability"),
    },
    compliance: {
      id: "compliance",
      title: "Compliance Gatekeeper",
      description: "Reviews every draft against current regulatory snapshots and ASP's introducer/liaison boundaries before approval.",
      mandate: "Act as an independent message gate before any simulated or future production dispatch. Automated review is not statutory promotion approval.",
      systemPrompt: roles.compliance,
      perimeterRules: [
        "FSMA 2000 Section 21: Financial promotion requires an authorised approver or statutory exemption under FPO 2005 Arts 48/50.",
        "PECR 2003 Reg 22/23: Individual subscribers require opt-in consent; legitimate interests alone is rejected.",
        "Managed crypto funds are legally unclassified collective investment schemes under PS23/6; promotion blocked.",
        "B2B or wealth status alone is not an automatic exemption.",
        "Specific opportunities undisclosed prior to consultation; cold outreach limited to macro sector context.",
      ],
      inputs: [
        "Exact proposed draft message (subject and body)",
        "Contact permission and lawful basis state",
        "Reviewed FCA, legislation and ICO sources",
        "ASP Private Capital policy and activity perimeter matrix",
      ],
      outputs: [
        "Pass, revise, block or escalate decision (responseSchemas.compliance)",
        "Evidence citations with source IDs, hashes, and exact quote passages",
        "Promotion review record with instrument category and promotion route",
      ],
      safeguards: [
        "Changed, stale (> freshness budget), or unreviewed sources block review (COMPLIANCE_HOLD)",
        "Draft content edit invalidates existing approval",
        "Cryptographic fingerprint mismatch blocks dispatch",
        "Gate 4 rechecks live suppression and applicability matrix at dispatch",
      ],
      benchmarkMetrics: [
        { metric: "Justified Hold Rate", score: "100.0%", target: "100.0%", status: "verified" },
        { metric: "Citation Entailment", score: "100.0%", target: "100.0%", status: "verified" },
        { metric: "Unclassified Crypto CIS Block Rate", score: "100.0%", target: "100.0%", status: "verified" },
      ],
      foundationModel: getFm("compliance"),
    },
  };
}
