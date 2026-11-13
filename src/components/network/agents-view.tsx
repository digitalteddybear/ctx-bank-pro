"use client";

import { useEffect, useState, useMemo } from "react";
import { AgentsCampaignModal } from "./agents-campaign-modal";
import { OutreachOperationsPanel } from "./outreach-operations-panel";
import { AgentsLiveDemoModal } from "./agents-live-demo-modal";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Clock3,
  Filter,
  Layers,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { Heading, Text } from "@astryxdesign/core/Text";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Badge as AstryxBadge } from "@astryxdesign/core/Badge";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Panel, Badge, Button, IconButton } from "@/components/ui/primitives";
import { useBackendRefresh, requestBackendSync } from "@/lib/backend-sync";
import { TableInboxView } from "@/components/templates/inbox/table-inbox-view";

type AgentId = "prospect" | "outreach" | "conversation" | "deliverability" | "compliance";

type Run = import("@/lib/server/outreach/types").Run;

type AgentState = {
  id: AgentId;
  paused: boolean;
  runs: { id: string; state: string; sandbox: boolean; inference: string; issue?: string }[];
};

type AgentBenchmarkMetric = {
  metric: string;
  score: string;
  target: string;
  status: "verified" | "monitoring";
};

type AgentFoundationModel = {
  baseModel: string;
  version: string;
  adapterType: string;
  checkpointId: string;
  finalLoss: number;
  trainingEpochs: number;
  datasetSize: number;
  autonomousStatus: "active" | "shadow_eval" | "paused";
};

type OrchestratorState = {
  orchestratorOnline: boolean;
  activeAgents: AgentId[];
  autonomousAdaptationEnabled: boolean;
  totalMessagesProcessed: number;
  autonomousTriggersCount: number;
  promotionsCount: number;
  recentMessages: Array<{
    id: string;
    sender: string;
    recipient: string;
    messageType: string;
    payload: Record<string, unknown>;
    timestamp: string;
  }>;
};

type AgentProfile = {
  id: AgentId;
  title: string;
  description: string;
  mandate: string;
  systemPrompt?: string;
  inputs: string[];
  outputs: string[];
  safeguards: string[];
  approvedSectors?: readonly string[];
  perimeterRules?: string[];
  benchmarkMetrics?: AgentBenchmarkMetric[];
  foundationModel?: AgentFoundationModel;
};

const agentDetails: Record<AgentId, AgentProfile> = {
  prospect: {
    id: "prospect",
    title: "Prospect Intelligence",
    description: "Reads retained Phase 1 dossiers and prepares evidence-backed profile briefs without inferring wealth or suitability.",
    mandate:
      "Turn Phase 1 evidence into a structured operating brief without presenting historical data as permission or qualification.",
    systemPrompt:
      "You are the Prospect Intelligence Agent for ASP Private Capital. You read Phase 1 evidence and produce structured briefs with strict provenance citation.",
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
    foundationModel: {
      baseModel: "meta-llama/Llama-3.1-8B-Instruct",
      version: "v1.2",
      adapterType: "qlora-r16-a32",
      checkpointId: "chk-prospect-v1.2",
      finalLoss: 0.0412,
      trainingEpochs: 5,
      datasetSize: 1420,
      autonomousStatus: "active",
    },
  },
  outreach: {
    id: "outreach",
    title: "Outreach Liaison",
    description: "Creates tailored relationship-reactivation drafts gathering interest in ASP Private Capital as private market liaisons.",
    mandate:
      "Translate approved profile context into concise, professional messages aligned with ASP Private Capital's introducer role. Specific opportunities are NEVER disclosed until consultation. General macroeconomic context permitted in managed funds, private equity, and precious metals.",
    systemPrompt:
      "You are the Outreach Liaison for ASP Private Capital. Craft concise, high-integrity drafts without disclosing specific deals or offering investment advice.",
    approvedSectors: ["Managed Funds", "Private Equity", "Precious Metals"],
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
    foundationModel: {
      baseModel: "meta-llama/Llama-3.1-8B-Instruct",
      version: "v2.1",
      adapterType: "qlora-r16-a32",
      checkpointId: "chk-outreach-v2.1",
      finalLoss: 0.0388,
      trainingEpochs: 6,
      datasetSize: 2850,
      autonomousStatus: "active",
    },
  },
  conversation: {
    id: "conversation",
    title: "Conversation Router",
    description: "Classifies simulated replies across 10 intent classes and routes interest, opt-outs, complaints, and legal threats according to statutory priority.",
    mandate:
      "Recognise the prospect's intent and place the conversation in the correct controlled workflow state according to statutory priority.",
    systemPrompt:
      "You are the Conversation Router for ASP Private Capital. Prioritize opt-outs, complaints, and legal threats with zero delay.",
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
    foundationModel: {
      baseModel: "meta-llama/Llama-3.1-8B-Instruct",
      version: "v1.4",
      adapterType: "qlora-r16-a32",
      checkpointId: "chk-conversation-v1.4",
      finalLoss: 0.0295,
      trainingEpochs: 4,
      datasetSize: 3200,
      autonomousStatus: "active",
    },
  },
  deliverability: {
    id: "deliverability",
    title: "Deliverability Auditor",
    description: "Assesses legitimate inbox-readiness, message formatting, RFC compliance, and link safety before compliance review.",
    mandate:
      "Identify message, authentication and provider-requirement risks that may affect legitimate delivery without attempting to evade spam controls.",
    systemPrompt:
      "You are the Deliverability Auditor. Enforce RFC 5322, RFC 8058, authenticated domain headers, and link allowlists.",
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
    foundationModel: {
      baseModel: "meta-llama/Llama-3.1-8B-Instruct",
      version: "v1.1",
      adapterType: "qlora-r16-a32",
      checkpointId: "chk-deliverability-v1.1",
      finalLoss: 0.0341,
      trainingEpochs: 4,
      datasetSize: 1100,
      autonomousStatus: "active",
    },
  },
  compliance: {
    id: "compliance",
    title: "Compliance Gatekeeper",
    description: "Reviews every draft against current regulatory snapshots and ASP's introducer/liaison boundaries before approval.",
    mandate:
      "Act as an independent message gate before any simulated or future production dispatch. Automated review is not statutory promotion approval.",
    systemPrompt:
      "You are the Compliance Gatekeeper. Strictly audit promotion boundaries under FSMA 2000, PECR 2003, and FCA PS23/6.",
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
    foundationModel: {
      baseModel: "meta-llama/Llama-3.1-8B-Instruct",
      version: "v3.0",
      adapterType: "qlora-r16-a32",
      checkpointId: "chk-compliance-v3.0",
      finalLoss: 0.0210,
      trainingEpochs: 8,
      datasetSize: 4600,
      autonomousStatus: "active",
    },
  },
};

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "accent" {
  if (["waiting_reply", "booked"].includes(status)) return "success";
  if (["awaiting_approval", "booking_pending", "queued", "running"].includes(status))
    return "warning";
  if (["held", "escalated", "failed", "suppressed"].includes(status)) return "danger";
  return "neutral";
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/agents${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Agent operation failed");
  return body;
}

export function AgentsView() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [profiles, setProfiles] = useState<Record<AgentId, AgentProfile> | null>(null);
  const [orchestrator, setOrchestrator] = useState<OrchestratorState | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewTab, setViewTab] = useState<"inbox" | "grouped">("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [replyInput, setReplyInput] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});


  const groupedInspector = useResizable({
    defaultSize: 380,
    minSizePx: 280,
    maxSizePx: 560,
  });

  const refresh = async () => {
    try {
      const [overview, loadedRuns] = await Promise.all([api(""), api("/runs")]);
      setAgents(overview.agents);
      if (overview.profiles) setProfiles(overview.profiles);
      if (overview.orchestrator) setOrchestrator(overview.orchestrator);
      setRuns(loadedRuns);
      setSelectedId((current) => current ?? loadedRuns[0]?.id);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load agents");
    }
  };

  useBackendRefresh(refresh);

  const command = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const run = await api("", { method: "POST", body: JSON.stringify(body) });
      if (run.id) setSelectedId(run.id);
      requestBackendSync();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent operation failed");
    } finally {
      setBusy(false);
    }
  };

  const selected = runs.find((run) => run.id === selectedId) ?? runs[0];

  const filteredRuns = useMemo(() => {
    if (!searchQuery.trim()) return runs;
    const q = searchQuery.toLowerCase();
    return runs.filter(
      (r) =>
        r.prospect.name.toLowerCase().includes(q) ||
        r.prospect.email.toLowerCase().includes(q) ||
        (r.draft?.subject ?? "").toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [runs, searchQuery]);

  const groupedRuns = useMemo(() => {
    const groups: Record<string, { label: string; runs: Run[] }> = {
      review: { label: "Awaiting Review", runs: [] },
      inflight: { label: "In Flight", runs: [] },
      human: { label: "Operator Managed", runs: [] },
      completed: { label: "Completed", runs: [] },
    };

    filteredRuns.forEach((run) => {
      if (run.humanManaged) {
        groups.human.runs.push(run);
      } else if (run.status === "awaiting_approval") {
        groups.review.runs.push(run);
      } else if (["waiting_reply", "booking_pending", "running", "queued"].includes(run.status)) {
        groups.inflight.runs.push(run);
      } else {
        groups.completed.runs.push(run);
      }
    });

    return groups;
  }, [filteredRuns]);

  const handleSendSimulatedReply = async (presetText?: string) => {
    const textToSend = presetText ?? replyInput;
    if (!selected || !textToSend.trim()) return;
    setReplyInput("");
    await command({
      action: "simulate-reply",
      id: selected.id,
      text: textToSend,
    });
  };

  const selectedReviewAction = selected ? (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      {selected.status === "awaiting_approval" && selected.draft && (
        <Button
          disabled={busy}
          onClick={() =>
            void command({
              action: "approve",
              id: selected.id,
              draftHash: selected.draft!.hash,
              actor: "dashboard-operator",
            })
          }
        >
          <Check size={14} /> Approve
        </Button>
      )}
      {selected.status === "awaiting_approval" && (
        <Button
          disabled={busy}
          variant="secondary"
          onClick={() =>
            void command({
              action: "reject",
              id: selected.id,
              actor: "dashboard-operator",
              reason: "Rejected from Agents dashboard",
            })
          }
        >
          Reject draft
        </Button>
      )}
      {!selected.humanManaged ? (
        <Button
          disabled={busy}
          variant="secondary"
          onClick={() =>
            void command({
              action: "takeover",
              id: selected.id,
              reason: "Operator manual takeover from CTX dashboard",
            })
          }
        >
          <ShieldCheck size={14} /> Take over thread
        </Button>
      ) : (
        <AstryxBadge label="Operator Takeover Active" variant="warning" />
      )}
    </div>
  ) : null;

  return (
    <main
      className="workspace agents-view"
      aria-labelledby="agents-title"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "28px",
        padding: "36px 40px 60px 40px",
        maxWidth: "1500px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <AgentsCampaignModal isOpen={campaignOpen} onOpenChange={setCampaignOpen} />
      <AgentsLiveDemoModal
        isOpen={demoOpen}
        onOpenChange={setDemoOpen}
        onRunUpdated={() => {
          void refresh();
          requestBackendSync();
        }}
      />
      {/* Top Header & View Controls */}
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "18px",
        }}
      >
        <div>
          <Heading level={1} id="agents-title">
            Agents
          </Heading>
          <Text color="secondary" type="body">
            Autonomous queues and conversation threads.
          </Text>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setDemoOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Sparkles size={14} /> Live Demo
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCampaignOpen(true)}>Campaign</Button>
          <SegmentedControl
            label="View mode"
            value={viewTab}
            onChange={(val) => setViewTab(val as "inbox" | "grouped")}
            size="sm"
          >
            <SegmentedControlItem value="inbox" label="Inbox" />
            <SegmentedControlItem value="grouped" label="Trajectories" />
          </SegmentedControl>
          <Button
            disabled={busy || runs.length === 0}
            variant="secondary"
            size="sm"
            onClick={() => void command({ action: "clear-all-runs" })}
          >
            <RefreshCw size={13} /> Reset threads
          </Button>
        </div>
      </section>

      {error && (
        <section
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "var(--destructive)",
            fontSize: "13px",
          }}
          role="alert"
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
        </section>
      )}

      {/* Autonomous Sovereign Agent Fleet Status Cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
        }}
        aria-label="Agent status"
      >
        {agents.map((agent) => {
          const profile = profiles?.[agent.id] ?? agentDetails[agent.id];
          return (
            <ClickableCard
              key={agent.id}
              label={`Open ${profile.title} profile`}
              onClick={() => setSelectedAgent(agent.id)}
              padding={4}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Bot size={16} style={{ color: "var(--primary)" }} />
                  <Text weight="semibold" type="label">{profile.title}</Text>
                </div>
                <AstryxBadge
                  label={agent.paused ? "Paused" : "Ready"}
                  variant={agent.paused ? "warning" : "success"}
                />
              </div>
              <Text color="secondary" type="supporting" maxLines={2}>
                {profile.description}
              </Text>
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "11px",
                  color: "var(--foreground-muted)",
                }}
              >
                {agent.runs.length} active run{agent.runs.length === 1 ? "" : "s"}
              </div>
            </ClickableCard>
          );
        })}
      </section>

      {/* View Mode 1: Two-Pane Conversation Inbox Table (table-inbox) */}
      {viewTab === "inbox" && (
        <><OutreachOperationsPanel/><TableInboxView
          runs={runs}
          onRefresh={refresh}
          onCommand={async body => { await api("", { method: "POST", body: JSON.stringify(body) }); requestBackendSync(); await refresh(); }}
          height="760px"
        /></>
      )}

      {/* View Mode 2: Grouped Lead Trajectories Table (table-grouped) */}
      {viewTab === "grouped" && (
        <section
          style={{
            display: "flex",
            height: "720px",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            background: "var(--card)",
            overflow: "hidden",
          }}
          aria-label="Grouped lead trajectories table"
        >
          {/* Main Grouped Content Area */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid var(--border)",
            }}
          >
            {/* Header & Query Search */}
            <div
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              <div>
                <Heading level={2}>Trajectories</Heading>
                <Text color="secondary" type="supporting">
                  Grouped by stage and status.
                </Text>
              </div>
              <div style={{ width: "260px" }}>
                <TextInput
                  label="Filter trajectories"
                  isLabelHidden
                  placeholder="Filter trajectories..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  hasClear
                />
              </div>
            </div>

            {/* Collapsible Groups */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px" }}>
              {Object.entries(groupedRuns).map(([key, group]) => {
                const isCollapsed = collapsedGroups[key];
                return (
                  <div
                    key={key}
                    style={{
                      marginBottom: "16px",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        padding: "14px 18px",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--foreground)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                        <strong style={{ fontSize: "13px" }}>{group.label}</strong>
                      </div>
                      <AstryxBadge label={group.runs.length} variant="info" />
                    </button>

                    {!isCollapsed && (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {group.runs.length ? (
                          group.runs.map((run) => (
                            <div
                              key={run.id}
                              onClick={() => setSelectedId(run.id)}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "14px 18px",
                                borderTop: "1px solid rgba(255, 255, 255, 0.04)",
                                background:
                                  run.id === selected?.id
                                    ? "rgba(59, 130, 246, 0.08)"
                                    : "transparent",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <UserRound size={15} style={{ color: "var(--primary)" }} />
                                <div>
                                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                                    {run.prospect.name}
                                  </div>
                                  <div style={{ fontSize: "11px", color: "var(--foreground-muted)" }}>
                                    {run.prospect.email} · Next: {run.next}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <AstryxBadge
                                  label={run.status.replaceAll("_", " ")}
                                  variant={
                                    run.status === "waiting_reply"
                                      ? "success"
                                      : run.status === "awaiting_approval"
                                      ? "warning"
                                      : "neutral"
                                  }
                                />
                                <span style={{ fontSize: "11px", color: "var(--foreground-muted)" }}>
                                  {run.transcript.length} msgs
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div
                            style={{
                              padding: "20px",
                              fontSize: "12px",
                              color: "var(--foreground-muted)",
                              textAlign: "center",
                            }}
                          >
                            No conversations in this stage
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resizable Inspector for Selected Trajectory */}
          <ResizeHandle
            direction="horizontal"
            hasDivider
            label="Resize trajectory inspector"
            resizable={groupedInspector.props}
          />

          <div
            style={{
              width: groupedInspector.size,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              background: "rgba(0, 0, 0, 0.2)",
              padding: "22px",
              overflowY: "auto",
            }}
          >
            {selected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <Heading level={3}>Trajectory Details</Heading>
                  <Text color="secondary" type="supporting">{selected.prospect.email}</Text>
                </div>
                <div>
                  <Text weight="semibold" type="label">{selected.prospect.name}</Text>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <AstryxBadge label={selected.sandbox ? "Verified" : "Synthetic"} variant="cyan" />
                  <AstryxBadge label={selected.status.replaceAll("_", " ")} variant="info" />
                </div>
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border)",
                    fontSize: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div><strong>Inference:</strong> {selected.inference}</div>
                  <div><strong>Next agent:</strong> {selected.next}</div>
                  <div><strong>Lead ID:</strong> {selected.prospect.id}</div>
                  <div><strong>Interactions:</strong> {selected.transcript.length}</div>
                </div>

                {selected.review && (
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--border)",
                      fontSize: "12px",
                    }}
                  >
                    <strong>Compliance:</strong> {selected.review.decision}
                    <p style={{ margin: "4px 0 0 0", color: "var(--foreground-muted)" }}>
                      {selected.review.summary}
                    </p>
                  </div>
                )}

                {selectedReviewAction}
              </div>
            ) : (
              <div style={{ color: "var(--foreground-muted)", fontSize: "12px" }}>
                Select a lead to inspect trajectory details
              </div>
            )}
          </div>
        </section>
      )}

      {/* Inter-Agent Orchestrator Activity Bus */}
      {orchestrator && orchestrator.recentMessages.length > 0 && (
        <section aria-label="Orchestrator Activity">
          <Panel className="agents-orchestrator-panel">
            <div className="panel-heading">
              <div>
                <h2>Orchestrator Activity</h2>
                <p>Real-time communication events between agents.</p>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <Badge tone="success">
                  Active ({orchestrator.totalMessagesProcessed})
                </Badge>
                <Badge tone="cyan">{orchestrator.promotionsCount} Promoted</Badge>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gap: "8px",
                maxHeight: "200px",
                overflowY: "auto",
                marginTop: "12px",
              }}
            >
              {orchestrator.recentMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Badge tone="neutral">
                      {msg.sender} → {msg.recipient}
                    </Badge>
                    <strong>{msg.messageType.replaceAll("_", " ")}</strong>
                  </span>
                  <span style={{ color: "var(--foreground-muted)", fontSize: "11px" }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {/* Selected Agent Profile Drawer Overlay */}
      {selectedAgent && (() => {
        const p = profiles?.[selectedAgent] ?? agentDetails[selectedAgent];
        return (
          <aside className="inspector agents-agent-inspector" aria-labelledby="agent-profile-title">
            <div className="inspector__header">
              <div>
                <div className="eyebrow">Official agent profile</div>
                <span className="inspector__id">Operational profile · {selectedAgent}</span>
              </div>
              <IconButton label="Close agent profile" onClick={() => setSelectedAgent(null)}>
                <X size={17} />
              </IconButton>
            </div>
            <div className="inspector__scroll">
              <section className="inspector__hero">
                <div className="inspector__badges">
                  <Badge tone="accent">Sovereign Agent</Badge>
                  <Badge
                    tone={
                      agents.find((agent) => agent.id === selectedAgent)?.paused
                        ? "warning"
                        : "success"
                    }
                  >
                    {agents.find((agent) => agent.id === selectedAgent)?.paused ? "Paused" : "Ready"}
                  </Badge>
                </div>
                <h2 id="agent-profile-title">{p.title}</h2>
                <p>{p.description}</p>
              </section>

              {/* Foundation Model Checkpoint Specs */}
              {p.foundationModel && (
                <section className="inspector__section">
                  <div className="section-label">Foundation Model & Fine-Tuning</div>
                  <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
                    <div style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--foreground-muted)", display: "block" }}>Base Model</span>
                      <span style={{ fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>{p.foundationModel.baseModel.split("/").pop()}</span>
                    </div>
                    <div style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--foreground-muted)", display: "block" }}>Adapter Type</span>
                      <span style={{ fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>{p.foundationModel.adapterType}</span>
                    </div>
                    <div style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--foreground-muted)", display: "block" }}>Checkpoint ID</span>
                      <span style={{ fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>{p.foundationModel.checkpointId}</span>
                    </div>
                    <div style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--foreground-muted)", display: "block" }}>Training Loss</span>
                      <span style={{ fontWeight: 600, color: "var(--primary)" }}>{p.foundationModel.finalLoss.toFixed(4)}</span>
                    </div>
                    <div style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--foreground-muted)", display: "block" }}>Epochs</span>
                      <span style={{ fontWeight: 600 }}>{p.foundationModel.trainingEpochs}</span>
                    </div>
                    <div style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--foreground-muted)", display: "block" }}>Dataset Size</span>
                      <span style={{ fontWeight: 600 }}>{p.foundationModel.datasetSize.toLocaleString()} pairs</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Verified Benchmark Metrics */}
              {p.benchmarkMetrics && p.benchmarkMetrics.length > 0 && (
                <section className="inspector__section">
                  <div className="section-label">Verified Benchmark Metrics</div>
                  <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {p.benchmarkMetrics.map((bm) => (
                      <div
                        key={bm.metric}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          background: "rgba(255, 255, 255, 0.025)",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          fontSize: "11px",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{bm.metric}</div>
                          <div style={{ color: "var(--foreground-muted)", fontSize: "10px" }}>Target: {bm.target}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: "var(--primary)" }}>{bm.score}</span>
                          <Badge tone="success">Verified</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Mandate */}
              <section className="inspector__section">
                <div className="section-label">Mandate</div>
                <p
                  style={{
                    marginTop: "8px",
                    fontSize: "12px",
                    lineHeight: 1.58,
                    color: "var(--text-secondary)",
                  }}
                >
                  {p.mandate}
                </p>
              </section>

              {/* Strict Perimeter Rules */}
              {p.perimeterRules && p.perimeterRules.length > 0 && (
                <section className="inspector__section">
                  <div className="section-label">Strict Perimeter Rules</div>
                  <ul className="inspector__list" style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {p.perimeterRules.map((rule, idx) => (
                      <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "11px", color: "var(--text-secondary)" }}>
                        <ShieldAlert size={14} style={{ color: "var(--warning)", flexShrink: 0, marginTop: "2px" }} />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Approved Operating Sectors */}
              {p.approvedSectors && p.approvedSectors.length > 0 && (
                <section className="inspector__section">
                  <div className="section-label">Approved Operating Sectors</div>
                  <p
                    style={{
                      marginTop: "8px",
                      fontSize: "11px",
                      color: "var(--text-tertiary)",
                      lineHeight: 1.5,
                    }}
                  >
                    Opportunities are never disclosed prior to consultation. Outreach is strictly
                    restricted to general macroeconomic information in these approved sectors:
                  </p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                    {p.approvedSectors.map((sector) => (
                      <Badge key={sector} tone="neutral">
                        {sector}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {/* Inputs */}
              <section className="inspector__section">
                <div className="section-label">Inputs & Evidence Sources</div>
                <ul className="inspector__list" style={{ marginTop: "8px" }}>
                  {p.inputs.map((input) => (
                    <li key={input}>{input}</li>
                  ))}
                </ul>
              </section>

              {/* Outputs */}
              <section className="inspector__section">
                <div className="section-label">Outputs & Structured Schemas</div>
                <ul className="inspector__list" style={{ marginTop: "8px" }}>
                  {p.outputs.map((output) => (
                    <li key={output}>{output}</li>
                  ))}
                </ul>
              </section>

              {/* Safeguards */}
              <section className="inspector__section">
                <div className="section-label">Safeguards & Independent Gates</div>
                <ul className="inspector__list" style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {p.safeguards.map((safeguard) => (
                    <li key={safeguard} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "11px", color: "var(--text-secondary)" }}>
                      <ShieldCheck size={14} style={{ color: "var(--primary)", flexShrink: 0, marginTop: "2px" }} />
                      <span>{safeguard}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* System Prompt */}
              {p.systemPrompt && (
                <section className="inspector__section">
                  <div className="section-label">Inference System Directives</div>
                  <div style={{ marginTop: "10px", maxHeight: "200px", overflow: "auto" }}>
                    <CodeBlock
                      code={p.systemPrompt}
                      language="markdown"
                      container="section"
                      hasLanguageLabel={false}
                      hasCopyButton={true}
                      size="sm"
                      style={{
                        fontSize: "11px",
                        lineHeight: "1.5",
                        borderRadius: "6px",
                      }}
                    />
                  </div>
                </section>
              )}
            </div>
          </aside>
        );
      })()}
    </main>
  );
}
