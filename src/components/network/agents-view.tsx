"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronRight, Clock3, Mail, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { Heading } from "@astryxdesign/core/Text";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Panel, Badge, Button, IconButton } from "@/components/ui/primitives";

type AgentId = "prospect" | "outreach" | "conversation" | "deliverability" | "compliance";
type Run = {
  id: string; sandbox: boolean; status: string; next: string; inference: string; issue?: string;
  prospect: { id: string; name: string; email: string; dossier?: string };
  draft?: { subject: string; body: string; hash: string };
  review?: { decision: string; summary: string };
  deliverability?: { decision: string; summary: string; checks: { id: string; status: string; detail: string }[] };
  transcript: { direction: string; text: string }[];
  humanManaged?: boolean;
  escalationQueue?: string;
  tags?: string[];
};
type AgentState = { id: AgentId; paused: boolean; runs: { id: string; state: string; sandbox: boolean; inference: string; issue?: string }[] };

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
  prospect: { id: "prospect", title: "Prospect intelligence", description: "Reads retained dossiers and prepares evidence-backed profile briefs.", mandate: "Turn Phase 1 evidence into a structured operating brief without presenting historical data as permission or qualification.", inputs: ["Complete Phase 1 Markdown dossier", "Parsed contact and validation fields", "Classification and investor-fit hypotheses", "Source paths, record IDs and validation history"], outputs: ["Evidence-cited profile summary", "Source references for each recorded fact", "Explicit unknowns and unresolved fields"], safeguards: ["Cannot infer wealth, suitability or permission", "Historical outreach flags remain provenance only", "Read-only access to the Phase 1 corpus"] },
  outreach: { id: "outreach", title: "Outreach", description: "Creates tailored relationship-reactivation drafts from recorded evidence.", mandate: "Translate approved profile context into concise, professional messages aligned with ASP Private Capital's introducer role.", inputs: ["Prospect intelligence brief", "Complete dossier context", "Conversation history and intent", "Approved ASP positioning and booking link"], outputs: ["Subject and message body", "Relationship-reactivation follow-ups", "Booking handoff language where requested"], safeguards: ["No investment advice or suitability claims", "Opt-out language is mandatory", "Every draft is sent to Compliance before approval"] },
  conversation: { id: "conversation", title: "Conversation", description: "Classifies simulated replies and routes interest, opt-outs and escalations.", mandate: "Recognise the prospect's intent and place the conversation in the correct controlled workflow state.", inputs: ["Latest inbound message", "Complete transcript", "Prospect dossier and current intent", "Conversation classification rules"], outputs: ["Interest, question, booking or opt-out classification", "Human escalation for advice, complaints or ambiguity", "Next workflow action"], safeguards: ["Never infers eligibility from interest", "Advice and complaints remain human-handled", "Duplicate events are idempotent"] },
  deliverability: { id: "deliverability", title: "Deliverability", description: "Assesses legitimate inbox-readiness before compliance approval.", mandate: "Identify message, authentication and provider-requirement risks that may affect legitimate delivery without attempting to evade spam controls.", inputs: ["Exact subject and message body", "MIME, HTML, image and attachment metadata", "Provider documentation for Gmail, Yahoo and Microsoft", "RFC 5322, RFC 8058 and approved sender controls"], outputs: ["Pass, revise, block or escalate assessment", "Checks for format, links, opt-out and authentication evidence", "Provider-source citations and infrastructure unknowns"], safeguards: ["Never guarantees inbox placement", "Cannot bypass provider filters or reputation systems", "Unknown SPF, DKIM, DMARC, TLS or reputation state is surfaced"] },
  compliance: { id: "compliance", title: "Compliance", description: "Reviews every draft against current source snapshots and ASP's liaison role.", mandate: "Act as an independent message gate before any simulated or future production dispatch.", inputs: ["Exact proposed message", "Permission and campaign state", "Reviewed FCA, legislation and ICO sources", "ASP Private Capital policy and role boundaries"], outputs: ["Pass, revise, block or escalate decision", "Evidence citations and source hashes", "Specific review summary"], safeguards: ["Changed or stale sources block review", "Automated review is not legal advice or approval", "ASP remains a capital introducer, not an investment adviser"] },
};

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "accent" {
  if (["waiting_reply", "booked"].includes(status)) return "success";
  if (["awaiting_approval", "booking_pending", "queued", "running"].includes(status)) return "warning";
  if (["held", "escalated", "failed", "suppressed"].includes(status)) return "danger";
  return "neutral";
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/agents${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Agent operation failed");
  return body;
}

export function AgentsView() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [profiles, setProfiles] = useState<Record<AgentId, AgentProfile> | null>(null);
  const [orchestrator, setOrchestrator] = useState<OrchestratorState | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0];

  const refresh = async () => {
    try {
      const [overview, loadedRuns] = await Promise.all([api(""), api("/runs")]);
      setAgents(overview.agents);
      if (overview.profiles) setProfiles(overview.profiles);
      if (overview.orchestrator) setOrchestrator(overview.orchestrator);
      setRuns(loadedRuns);
      setSelectedId((current) => current ?? loadedRuns[0]?.id);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load agents"); }
  };
  useEffect(() => { void refresh(); const interval = window.setInterval(() => void refresh(), 4000); return () => window.clearInterval(interval); }, []);

  const command = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { const run = await api("", { method: "POST", body: JSON.stringify(body) }); setRuns((current) => current.some((item) => item.id === run.id) ? current.map((item) => item.id === run.id ? run : item) : [run, ...current]); setSelectedId(run.id); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Agent operation failed"); }
    finally { setBusy(false); }
  };

  const selectedReviewAction = selected ? (
    <div className="agents-detail__actions">
      {selected.status === "awaiting_approval" && selected.draft && (
        <Button disabled={busy} onClick={() => void command({ action: "approve", id: selected.id, draftHash: selected.draft!.hash, actor: "dashboard-operator" })}><Check size={14} /> Approve simulation</Button>
      )}
      {selected.status === "awaiting_approval" && (
        <Button disabled={busy} variant="secondary" onClick={() => void command({ action: "reject", id: selected.id, actor: "dashboard-operator", reason: "Rejected from Agents dashboard" })}>Reject draft</Button>
      )}
      {!selected.humanManaged && (
        <Button disabled={busy} variant="secondary" onClick={() => void command({ action: "takeover", id: selected.id, reason: "Operator manual takeover from CTX dashboard" })}><ShieldCheck size={14} /> Take over thread</Button>
      )}
    </div>
  ) : null;

  return <main className="workspace agents-view" aria-labelledby="agents-title">
    <section className="workspace-heading">
      <div><Badge tone="accent">Operations</Badge><Heading level={1}>Agents</Heading><p>Live sovereign agent network status, active conversations and recorded interactions.</p></div>
      <div className="workspace-heading__actions">
        <Button disabled={busy || runs.length === 0} variant="secondary" onClick={() => void command({ action: "clear-all-runs" })}>Reset conversations</Button>
      </div>
    </section>
    <section className="agents-banner" aria-label="Sandbox status"><ShieldCheck size={17} /><span><strong>Phase 1 Validated Cohort Only</strong> — Outreach agents interact exclusively with contacts parsed & validated through Phase 1. Manual operator communications are strictly guarded with non-interference protocols.</span></section>
    {error && <section className="agents-error" role="alert"><AlertTriangle size={16} />{error}</section>}
    <section className="agents-grid" aria-label="Agent status">
      {agents.map((agent) => {
        const profile = profiles?.[agent.id] ?? agentDetails[agent.id];
        return (
          <ClickableCard className="panel agent-card" key={agent.id} label={`Open ${profile.title} profile`} onClick={() => setSelectedAgent(agent.id)} padding={4}>
            <div className="agent-card__header">
              <span className="agent-card__icon"><Bot size={16} /></span>
              <Badge tone={agent.paused ? "warning" : "success"}>{agent.paused ? "Paused" : "Ready"}</Badge>
            </div>
            <Heading level={2}>{profile.title}</Heading>
            <p>{profile.description}</p>
            <span className="agent-card__count">{agent.runs.length} active run{agent.runs.length === 1 ? "" : "s"}</span>
          </ClickableCard>
        );
      })}
    </section>
    <section className="agents-layout">
      <Panel className="agents-queue">
        <div className="panel-heading">
          <div><Badge tone="accent">Workflow queue</Badge><h2>Recorded conversations</h2></div>
          <Clock3 size={17} />
        </div>
        <div className="agents-queue__list">
          {runs.length ? runs.map((run) => (
            <button className={`agents-run-row ${run.id === selected?.id ? "is-selected" : ""}`} key={run.id} onClick={() => setSelectedId(run.id)}>
              <span className="agents-run-row__identity">
                <UserRound size={15} />
                <span><strong>{run.prospect.name}</strong><small>{run.prospect.email}</small></span>
              </span>
              <span>
                <Badge tone={run.sandbox ? "cyan" : "neutral"}>{run.sandbox ? "Live Lead" : "Fixture"}</Badge>
                <Badge tone={statusTone(run.status)}>{run.status.replaceAll("_", " ")}</Badge>
              </span>
              <ChevronRight size={15} />
            </button>
          )) : (
            <div className="agents-empty" style={{ minHeight: "220px" }}>
              <Clock3 size={20} />
              <p>No conversation threads recorded yet.</p>
              <small style={{ color: "var(--text-tertiary)" }}>Autonomous outreach runs initiated via the backend will record here in real time.</small>
            </div>
          )}
        </div>
      </Panel>
      <Panel className="agents-detail">{selected ? <><div className="panel-heading"><div><Badge tone="cyan">{selected.sandbox ? "Phase 1 Validated Lead" : "Synthetic test"}</Badge><h2>{selected.prospect.name}</h2><p>{selected.prospect.email}</p></div><Badge tone={statusTone(selected.status)}>{selected.status.replaceAll("_", " ")}</Badge></div><div className="agents-detail__meta"><span><strong>Next agent</strong>{selected.next}</span><span><strong>Inference</strong>{selected.inference}</span><span><strong>Lead provenance</strong>{selected.prospect.id.startsWith("lead-") ? selected.prospect.id : "Phase 1 Verified"}</span><span><strong>Delivery</strong>{selected.sandbox ? "Live Gmail SMTP" : "Disabled"}</span></div>{selected.humanManaged && <section className="agents-review" style={{ borderColor: "rgba(234, 179, 8, 0.4)", background: "rgba(234, 179, 8, 0.05)" }}><div><AlertTriangle size={15} /><strong style={{ color: "var(--warning)" }}>Human Operator Ownership Active</strong></div><p>This conversation has been taken over by the human mailbox owner. Autonomous agent dispatch is frozen to prevent interference with manual communications.</p></section>}{selected.deliverability && <section className="agents-review agents-deliverability"><div><Mail size={15} /><strong>Deliverability: {selected.deliverability.decision}</strong></div><p>{selected.deliverability.summary}</p><ul>{selected.deliverability.checks.map((check) => <li key={check.id}><Badge tone={check.status === "fail" ? "danger" : check.status === "warn" ? "warning" : "success"}>{check.status}</Badge><span>{check.detail}</span></li>)}</ul></section>}{selected.review && <section className="agents-review"><div><ShieldCheck size={15} /><strong>Compliance review: {selected.review.decision}</strong></div><p>{selected.review.summary}</p></section>}{selected.draft && <section className="agents-draft"><div className="agents-draft__heading"><Mail size={15} /><strong>{selected.draft.subject}</strong></div><p>{selected.draft.body}</p></section>}{selectedReviewAction}<div className="agents-detail__transcript"><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "8px" }}><strong>Correspondence Thread ({selected.transcript.length} message{selected.transcript.length === 1 ? "" : "s"})</strong><Badge tone="cyan">Phase 1 Guarded</Badge></div>{selected.transcript.length ? selected.transcript.map((message, index) => <article key={`${message.direction}-${index}`} style={{ marginBottom: "12px", padding: "14px", borderRadius: "8px", background: message.direction === "inbound" ? "rgba(99, 102, 241, 0.08)" : "rgba(16, 185, 129, 0.06)", border: message.direction === "inbound" ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid rgba(16, 185, 129, 0.25)" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}><Badge tone={message.direction === "inbound" ? "accent" : "success"}>{message.direction === "inbound" ? `👤 Prospect (${selected.prospect.name})` : "🤖 Dylan (ASP Private Capital)"}</Badge><span style={{ fontSize: "11px", color: "var(--foreground-muted)" }}>{message.direction === "inbound" ? "Inbound Reply" : "Outbound Email (Agent Instigated)"}</span></div><p style={{ whiteSpace: "pre-line", margin: 0, fontSize: "13px", lineHeight: "1.6" }}>{message.text}</p></article>) : <p className="agents-empty">No correspondence recorded yet.</p>}</div></> : <div className="agents-empty"><Bot size={22} /><p>Select a Phase 1 run to inspect its workflow.</p></div>}</Panel>
    </section>
    {orchestrator && orchestrator.recentMessages.length > 0 && (
      <section style={{ marginTop: "16px" }} aria-label="Inter-Agent Communication Bus">
        <Panel className="agents-orchestrator-panel">
          <div className="panel-heading">
            <div>
              <Badge tone="accent">Autonomous Orchestrator</Badge>
              <h2>Inter-Agent Communication Bus</h2>
              <p>Peer-to-peer event stream parsing real-world developments across sovereign agent boundaries.</p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Badge tone="success">Network Active ({orchestrator.totalMessagesProcessed} msgs)</Badge>
              <Badge tone="cyan">{orchestrator.promotionsCount} Checkpoints Promoted</Badge>
            </div>
          </div>
          <div style={{ display: "grid", gap: "8px", maxHeight: "200px", overflowY: "auto", marginTop: "12px" }}>
            {orchestrator.recentMessages.map((msg) => (
              <div key={msg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", fontSize: "12px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Badge tone="neutral">{msg.sender} → {msg.recipient}</Badge>
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
                <Badge tone={agents.find((agent) => agent.id === selectedAgent)?.paused ? "warning" : "success"}>
                  {agents.find((agent) => agent.id === selectedAgent)?.paused ? "Paused" : "Ready"}
                </Badge>
              </div>
              <h2 id="agent-profile-title">{p.title}</h2>
              <p>{p.description}</p>
            </section>
            <section className="inspector__section">
              <div className="section-label">Mandate</div>
              <p style={{ marginTop: "8px", fontSize: "12px", lineHeight: 1.58, color: "var(--text-secondary)" }}>{p.mandate}</p>
            </section>
            {p.approvedSectors && p.approvedSectors.length > 0 && (
              <section className="inspector__section">
                <div className="section-label">Approved Operating Sectors</div>
                <p style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                  Opportunities are never disclosed prior to consultation. Outreach is strictly restricted to general macroeconomic information in these approved sectors:
                </p>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                  {p.approvedSectors.map((sector) => (
                    <Badge key={sector} tone="cyan">
                      {sector.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
            {p.perimeterRules && p.perimeterRules.length > 0 && (
              <section className="inspector__section">
                <div className="section-label">Perimeter Rules & Boundaries</div>
                <ul style={{ display: "grid", gap: "8px", margin: "10px 0 0", paddingLeft: "17px", color: "var(--text-secondary)", fontSize: "11px", lineHeight: 1.55 }}>
                  {p.perimeterRules.map((rule, idx) => (
                    <li key={idx}><strong>{rule}</strong></li>
                  ))}
                </ul>
              </section>
            )}
            {p.benchmarkMetrics && p.benchmarkMetrics.length > 0 && (
              <section className="inspector__section">
                <div className="section-label">Verified Benchmark Metrics (200-Case Evaluation)</div>
                <ul style={{ listStyleType: "none", paddingLeft: 0, display: "grid", gap: "8px", margin: "10px 0 0" }}>
                  {p.benchmarkMetrics.map((bm) => (
                    <li key={bm.metric} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                      <span style={{ color: "var(--text-secondary)" }}>{bm.metric}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong>{bm.score}</strong>
                        <Badge tone={bm.status === "verified" ? "success" : "neutral"}>{bm.status}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {p.foundationModel && (
              <section className="inspector__section">
                <div className="section-label">Sovereign Foundation Model & LoRA Checkpoint</div>
                <div style={{ display: "grid", gap: "7px", fontSize: "11px", margin: "10px 0 0", color: "var(--text-secondary)" }}>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Base Architecture:</span> <code style={{ color: "var(--cyan-brand)" }}>{p.foundationModel.baseModel}</code></div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Active Checkpoint:</span> <code style={{ color: "var(--cyan-brand)" }}>{p.foundationModel.checkpointId}</code> (v{p.foundationModel.version})</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Adapter Configuration:</span> <code>{p.foundationModel.adapterType.toUpperCase()}</code> (Epochs: {p.foundationModel.trainingEpochs}, Loss: {p.foundationModel.finalLoss})</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Training Samples:</span> {p.foundationModel.datasetSize} curated samples</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                    <Badge tone="success">Autonomous {p.foundationModel.autonomousStatus}</Badge>
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() => void command({ action: "train-agent", agentId: selectedAgent, version: "1.1.0" })}
                    >
                      <Sparkles size={12} /> Train Candidate Adapter
                    </Button>
                  </div>
                </div>
              </section>
            )}
            {p.systemPrompt && (
              <section className="inspector__section">
                <div className="section-label">Active System Instructions</div>
                <div style={{ background: "color-mix(in srgb, var(--primary) 6%, var(--card))", border: "1px solid color-mix(in srgb, var(--primary) 20%, var(--border))", borderRadius: "var(--panel-radius)", padding: "10px 12px", marginTop: "10px", fontFamily: "var(--font-mono)", fontSize: "10px", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5, color: "var(--text-secondary)" }}>
                  {p.systemPrompt}
                </div>
              </section>
            )}
            <section className="inspector__section">
              <div className="section-label">Authorised Operating Context</div>
              <p style={{ margin: "8px 0 10px", fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                This is the information supplied to the agent for its task. It is operating context, not model training or a grant of production authority.
              </p>
              <ul style={{ display: "grid", gap: "6px", margin: 0, paddingLeft: "17px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                {p.inputs.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
            <section className="inspector__section">
              <div className="section-label">Produces</div>
              <ul style={{ display: "grid", gap: "6px", margin: "10px 0 0", paddingLeft: "17px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                {p.outputs.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
            <section className="inspector__section">
              <div className="section-label">Controls and Limitations</div>
              <ul style={{ display: "grid", gap: "6px", margin: "10px 0 0", paddingLeft: "17px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                {p.safeguards.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
            <section className="inspector__section">
              <div className="section-label">Current State</div>
              <div style={{ display: "grid", gap: "6px", margin: "10px 0 0", fontSize: "11px" }}>
                <p style={{ display: "flex", alignItems: "center", gap: "7px", margin: 0, color: "var(--text-secondary)" }}>
                  <span className="status-pulse" />{" "}
                  {agents.find((agent) => agent.id === selectedAgent)?.paused ? "Paused" : "Ready for live workflow"}
                </p>
                <p style={{ margin: 0, color: "var(--text-tertiary)" }}>
                  {agents.find((agent) => agent.id === selectedAgent)?.runs.length ?? 0} active workflow runs
                </p>
              </div>
            </section>
          </div>
        </aside>
      );
    })()}
  </main>;
}
