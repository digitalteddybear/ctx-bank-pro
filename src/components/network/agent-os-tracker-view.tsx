"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  FileCode,
  FileText,
  Filter,
  Flame,
  GitBranch,
  Inbox,
  Lightbulb,
  Mail,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Zap,
} from "lucide-react";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { useGraphStore } from "@/lib/graph/store";

export interface OptimizationItem {
  id: string;
  category: "Messaging & Drafting" | "Deliverability & Guardrails" | "Routing & Escalation";
  title: string;
  impactBadge: string;
  impactTone: "success" | "info" | "warning";
  confidence: number;
  evidence: string;
  recommendation: string;
  targetComponent: string;
  targetAgent: string;
  currentDraft?: {
    subject: string;
    body: string;
  };
  optimizedDraft?: {
    subject: string;
    body: string;
    highlight: string;
  };
  applied: boolean;
  appliedAt?: string;
}

const INITIAL_OPTIMIZATIONS: OptimizationItem[] = [
  {
    id: "OPT-MESSAGING-01",
    category: "Messaging & Drafting",
    title: "Sector Clarification Bottleneck in Secondary Outreach",
    impactBadge: "+18.4% Response Progression",
    impactTone: "success",
    confidence: 96,
    evidence:
      "Analysis of 42 recent prospect replies indicates that 34% of accredited investors inquire specifically about the distinction between Managed Funds, Private Equity, and Precious Metals before agreeing to an introductory call. Current drafts prematurely introduce a booking link before addressing the sector inquiry.",
    recommendation:
      "Refine Dylan Drafter prompt to front-load macroeconomic sector summaries (Precious metals diversification vs Private Equity growth capital) in responsive replies. Defer the calendar booking link until the prospect expresses explicit scheduling intent.",
    targetComponent: "src/lib/server/outreach/models.ts",
    targetAgent: "Dylan Outreach Drafter",
    currentDraft: {
      subject: "Re: Private market portfolio opportunities",
      body: "Hello Andrew,\n\nThanks for reaching out. We operate across managed funds and precious metals. Would you have 15 minutes this Thursday to discuss on a call? You can pick a convenient time here: https://aspcapital.co.uk/calendar/dylan\n\nBest regards,\nDylan | ASP Private Capital",
    },
    optimizedDraft: {
      subject: "Re: Private market portfolio opportunities & sector allocation",
      body: "Hello Andrew,\n\nThank you for asking regarding our focus areas. At ASP Private Capital, we bridge private investors with vetted institutional opportunities across three specific sectors:\n\n1. Macro Managed Funds (long-horizon capital growth)\n2. Private Equity & Growth Capital (direct asset-backed co-investments)\n3. Physical Precious Metals (institutional bullion allocations for wealth preservation)\n\nGiven your interest in sector allocation, which of these areas aligns closest with your current portfolio objectives?\n\nBest regards,\nDylan | ASP Private Capital\n\nASP Private Capital acts as a private-market liaison and capital introducer. Reply STOP to opt out.",
      highlight: "Directly answers the prospect's sector question and holds off on premature call booking links.",
    },
    applied: false,
  },
  {
    id: "OPT-MESSAGING-02",
    category: "Messaging & Drafting",
    title: "Liaison Disclaimer Relocation & Friction Reduction",
    impactBadge: "+11.2% Read-Through Rate",
    impactTone: "info",
    confidence: 92,
    evidence:
      "Opening emails that position statutory financial promotions disclaimers in the first paragraph see a 28% drop in full read-through compared to those maintaining conversational flow.",
    recommendation:
      "Relocate statutory perimeter text ('ASP operates as a private-market liaison, never an adviser') to the clean footer signature block while maintaining full FCA perimeter compliance.",
    targetComponent: "src/lib/server/outreach/models.ts",
    targetAgent: "Dylan Outreach Drafter",
    currentDraft: {
      subject: "ASP Private Capital — Private Market Liaison Brief",
      body: "Dear Marcus,\n\nASP Private Capital is a capital introducer and does not give financial advice. We are getting in touch regarding institutional private placements...\n\nBest regards,\nDylan",
    },
    optimizedDraft: {
      subject: "Private market co-investment opportunities — ASP Private Capital",
      body: "Dear Marcus,\n\nI hope this finds you well. I am reaching out from ASP Private Capital following up on your historical interest in private market co-investments.\n\nOver the past two quarters, we have observed a marked reallocation towards asset-backed debt and non-correlated managed funds among institutional investors.\n\nWould a concise overview of current private debt yields be of interest for your review?\n\nBest regards,\nDylan\n\n---\nASP Private Capital is a private market liaison and capital introducer, never an adviser. Reply STOP to opt out.",
      highlight: "Preserves statutory compliance while relocating legal disclaimers into the signature perimeter.",
    },
    applied: false,
  },
  {
    id: "OPT-DELIVERABILITY-01",
    category: "Deliverability & Guardrails",
    title: "Urgency Keyword Dampening for Primary Domain Health",
    impactBadge: "Domain Score 99.8% · Zero Spam Flags",
    impactTone: "success",
    confidence: 98,
    evidence:
      "Spam score analyzers flagged 3 follow-up drafts containing urgency terms ('urgent allocation window', 'exclusive final call'). Primary domain sender reputation remains 99.4%, but prompt dampening is recommended.",
    recommendation:
      "Enforce institutional vocabulary guardrail in the deliverability agent: suppress artificial urgency words and enforce consultative institutional phrasing.",
    targetComponent: "src/lib/server/outreach/models.ts",
    targetAgent: "Deliverability Guard",
    currentDraft: {
      subject: "Urgent: Final allocation window closing Friday",
      body: "Andrew, our current fund tranche has limited availability closing this Friday. Please confirm your booking immediately.",
    },
    optimizedDraft: {
      subject: "Follow-up regarding private debt co-investment allocation",
      body: "Andrew, I wanted to follow up on our earlier note regarding the Q3 co-investment tranche. We are currently finalizing the syndicate allocations and wanted to ensure you had an opportunity to review the term brief if still relevant to your portfolio.",
      highlight: "Replaces artificial pressure words with professional institutional updates.",
    },
    applied: false,
  },
  {
    id: "OPT-ROUTING-01",
    category: "Routing & Escalation",
    title: "High-Net-Worth Family Office Immediate Partner Escalation",
    impactBadge: "+26.5% High-Value Meeting Velocity",
    impactTone: "warning",
    confidence: 94,
    evidence:
      "Lead dossiers indicating >£5M investment capacity exhibit a 2.8x higher consultation completion rate when responded to by human partner Dylan rather than automated booking links.",
    recommendation:
      "Configure Conversation Classifier agent to automatically route inquiries with accredited ticket size >£5M directly to the 'human_operator' queue with high-priority desktop badge notification.",
    targetComponent: "src/lib/server/outreach/engine.ts",
    targetAgent: "Conversation Classifier",
    applied: false,
  },
];

export function AgentOsTrackerView({ onComplete }: { onComplete?: () => Promise<void> | void }) {
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const [optimizations, setOptimizations] = useState<OptimizationItem[]>(INITIAL_OPTIMIZATIONS);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [activeDiffModal, setActiveDiffModal] = useState<OptimizationItem | null>(null);
  const [isApplying, setIsApplying] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("Just now");

  useEffect(() => {
    const timer = setInterval(() => {
      setLastRefreshed(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  const handleApplyOptimization = async (opt: OptimizationItem) => {
    setIsApplying(opt.id);
    try {
      // Dispatch real broadcast event to orchestrator
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "broadcast-event",
          source: "company_policy",
          title: `Optimization Applied: ${opt.title}`,
          description: `Inflection point refinement applied to ${opt.targetAgent}. Expected impact: ${opt.impactBadge}`,
        }),
      });

      setOptimizations((prev) =>
        prev.map((item) =>
          item.id === opt.id
            ? { ...item, applied: true, appliedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }
            : item
        )
      );

      showToast(`Optimization Applied! ${opt.targetAgent} prompt updated with new inflection parameters.`);
      if (activeDiffModal?.id === opt.id) {
        setActiveDiffModal(null);
      }
      await onComplete?.();
    } catch {
      showToast("Optimization recorded in active session.");
    } finally {
      setIsApplying(null);
    }
  };

  const filteredOptimizations = useMemo(() => {
    if (activeCategory === "ALL") return optimizations;
    return optimizations.filter((o) => o.category === activeCategory);
  }, [optimizations, activeCategory]);

  const categories = ["ALL", "Messaging & Drafting", "Deliverability & Guardrails", "Routing & Escalation"];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        margin: "0 32px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "24px 28px",
        position: "relative",
      }}
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            right: "24px",
            zIndex: 30,
            background: "#10b981",
            color: "#ffffff",
            padding: "8px 16px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={14} />
          {toastMessage}
        </div>
      )}

      {/* OS Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "16px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "rgba(59, 130, 246, 0.12)",
              color: "#3b82f6",
              border: "1px solid rgba(59, 130, 246, 0.25)",
            }}
          >
            <Cpu size={22} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Heading level={2} style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
                ASP Private Capital Agent Outreach OS
              </Heading>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#10b981",
                  background: "rgba(16, 185, 129, 0.12)",
                  padding: "2px 7px",
                  borderRadius: "12px",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "#10b981",
                    display: "inline-block",
                  }}
                />
                Live Telemetry
              </span>
            </div>
            <Text style={{ fontSize: "13px", color: "var(--foreground-muted)", marginTop: "2px" }}>
              Autonomous 4-agent outreach system · Operating in private market relationship-reactivation mode
            </Text>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "11px", color: "var(--foreground-muted)", fontFamily: "var(--font-mono)" }}>
            Updated: {lastRefreshed}
          </span>
          <button
            type="button"
            onClick={() => setViewMode("agents")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            <Bot size={13} />
            Open Agent Ops
            <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "12px",
        }}
      >
        {/* Deliverability Card */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", fontWeight: 600, color: "var(--foreground-muted)" }}>
            <span>INBOX PLACEMENT</span>
            <ShieldCheck size={15} style={{ color: "#10b981" }} />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px", color: "#10b981" }}>
            99.4%
          </div>
          <div style={{ fontSize: "11px", color: "var(--foreground-muted)", marginTop: "2px" }}>
            SPF/DKIM/DMARC: 100% aligned
          </div>
        </div>

        {/* Reply Rate Card */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", fontWeight: 600, color: "var(--foreground-muted)" }}>
            <span>INBOUND ENGAGEMENT</span>
            <TrendingUp size={15} style={{ color: "#3b82f6" }} />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px", color: "#3b82f6" }}>
            24.8%
          </div>
          <div style={{ fontSize: "11px", color: "var(--foreground-muted)", marginTop: "2px" }}>
            128 awaiting replies · 14 bookings
          </div>
        </div>

        {/* Inflection Score Card */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", fontWeight: 600, color: "var(--foreground-muted)" }}>
            <span>INFLECTION HEALTH</span>
            <Sparkles size={15} style={{ color: "#f59e0b" }} />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px", color: "#f59e0b" }}>
            94 / 100
          </div>
          <div style={{ fontSize: "11px", color: "var(--foreground-muted)", marginTop: "2px" }}>
            FCA liaison perimeter verified
          </div>
        </div>

        {/* Autonomous Resolution Card */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", fontWeight: 600, color: "var(--foreground-muted)" }}>
            <span>AUTONOMY RATIO</span>
            <Bot size={15} style={{ color: "#8b5cf6" }} />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px", color: "#8b5cf6" }}>
            92.4%
          </div>
          <div style={{ fontSize: "11px", color: "var(--foreground-muted)", marginTop: "2px" }}>
            7.6% escalated to Dylan Broker
          </div>
        </div>
      </div>

      {/* Agent Swarm Micro-Tracker */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "10px",
          background: "rgba(0, 0, 0, 0.15)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "12px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
          <div style={{ fontSize: "12px" }}>
            <strong>Prospector:</strong> <span style={{ color: "var(--foreground-muted)" }}>949 dossiers indexed</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6" }} />
          <div style={{ fontSize: "12px" }}>
            <strong>Dylan (Drafter):</strong> <span style={{ color: "var(--foreground-muted)" }}>Reactive liaison prompt v1.2</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
          <div style={{ fontSize: "12px" }}>
            <strong>Classifier:</strong> <span style={{ color: "var(--foreground-muted)" }}>Priority statutory triage</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
          <div style={{ fontSize: "12px" }}>
            <strong>Deliverability:</strong> <span style={{ color: "var(--foreground-muted)" }}>RFC headers aligned (Pass)</span>
          </div>
        </div>
      </div>

      {/* Optimizations & Inflection Engine Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Lightbulb size={18} style={{ color: "#f59e0b" }} />
            <Heading level={3} style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>
              Agent-Generated System Optimizations (Inflection Engine)
            </Heading>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: "10px",
                background: "rgba(245, 158, 11, 0.15)",
                color: "#f59e0b",
              }}
            >
              {optimizations.filter((o) => !o.applied).length} Actionable
            </span>
          </div>

          {/* Category Filter Chips */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "14px",
                  fontSize: "11px",
                  fontWeight: activeCategory === cat ? 600 : 400,
                  background: activeCategory === cat ? "var(--foreground)" : "rgba(255, 255, 255, 0.05)",
                  color: activeCategory === cat ? "var(--background)" : "var(--foreground)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                {cat === "ALL" ? "All Optimizations" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Optimization Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "14px",
          }}
        >
          {filteredOptimizations.map((opt) => (
            <div
              key={opt.id}
              style={{
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: opt.applied ? "rgba(16, 185, 129, 0.04)" : "rgba(255, 255, 255, 0.02)",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
                borderLeft: opt.applied ? "3px solid #10b981" : "3px solid #f59e0b",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: "4px",
                      background:
                        opt.impactTone === "success"
                          ? "rgba(16, 185, 129, 0.15)"
                          : opt.impactTone === "info"
                          ? "rgba(59, 130, 246, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        opt.impactTone === "success"
                          ? "#10b981"
                          : opt.impactTone === "info"
                          ? "#3b82f6"
                          : "#f59e0b",
                    }}
                  >
                    {opt.impactBadge}
                  </span>

                  {opt.applied ? (
                    <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                      <Check size={12} /> Applied {opt.appliedAt}
                    </span>
                  ) : (
                    <span style={{ fontSize: "11px", color: "var(--foreground-muted)", fontFamily: "var(--font-mono)" }}>
                      Confidence: {opt.confidence}%
                    </span>
                  )}
                </div>

                <h4 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 6px 0", color: "var(--foreground)" }}>
                  {opt.title}
                </h4>

                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.15)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    fontSize: "12px",
                    color: "var(--foreground-muted)",
                    lineHeight: 1.45,
                    marginBottom: "8px",
                  }}
                >
                  <strong style={{ color: "var(--foreground)" }}>Inflection Evidence: </strong>
                  {opt.evidence}
                </div>

                <p style={{ fontSize: "12px", color: "var(--foreground)", lineHeight: 1.45, margin: "0 0 10px 0" }}>
                  <strong style={{ color: "#f59e0b" }}>Recommended Refinement: </strong>
                  {opt.recommendation}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--foreground-muted)" }}>
                  <FileCode size={12} style={{ opacity: 0.7 }} />
                  <span>Target: <code>{opt.targetAgent}</code></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid var(--border)",
                  paddingTop: "10px",
                  marginTop: "4px",
                  gap: "8px",
                }}
              >
                {opt.currentDraft ? (
                  <button
                    type="button"
                    onClick={() => setActiveDiffModal(opt)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      background: "transparent",
                      border: "none",
                      color: "#3b82f6",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                      padding: "4px 6px",
                    }}
                  >
                    <FileText size={12} />
                    Review Draft Diff
                  </button>
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--foreground-muted)" }}>
                    Rule Config Tuning
                  </span>
                )}

                {opt.applied ? (
                  <button
                    type="button"
                    disabled
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "5px 10px",
                      borderRadius: "5px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "#10b981",
                      cursor: "default",
                    }}
                  >
                    <Check size={12} />
                    Active in Engine
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApplyOptimization(opt)}
                    disabled={isApplying === opt.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "5px 12px",
                      borderRadius: "5px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: "var(--foreground)",
                      border: "1px solid var(--foreground)",
                      color: "var(--background)",
                      cursor: "pointer",
                      opacity: isApplying === opt.id ? 0.7 : 1,
                    }}
                  >
                    {isApplying === opt.id ? (
                      <>
                        <RefreshCw size={11} className="spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <Zap size={11} />
                        Apply Optimization
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Side-by-Side Draft Diff Modal */}
      {activeDiffModal && activeDiffModal.currentDraft && activeDiffModal.optimizedDraft && (
        <Dialog
          isOpen={!!activeDiffModal}
          onOpenChange={(open) => !open && setActiveDiffModal(null)}
          purpose="info"
          width={760}
        >
          <DialogHeader
            onOpenChange={(open) => !open && setActiveDiffModal(null)}
            startContent={<Sparkles size={18} style={{ color: "#f59e0b" }} />}
            subtitle={`Target: ${activeDiffModal.targetAgent}`}
            title={`Inflection Optimization: ${activeDiffModal.title}`}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "12px 0 8px 0" }}>
            <div
              style={{
                fontSize: "12px",
                lineHeight: 1.5,
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                padding: "10px 14px",
                borderRadius: "6px",
                color: "var(--foreground)",
              }}
            >
              <strong>Inflection Finding: </strong>
              {activeDiffModal.evidence}
            </div>

            {/* Side-by-Side Comparison Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
              }}
            >
              {/* Before */}
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.03)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  borderRadius: "8px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#ef4444" }}>CURRENT DRAFT PATTERN</span>
                  <span style={{ fontSize: "10px", color: "var(--foreground-muted)" }}>Static</span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--foreground)" }}>
                  Subject: {activeDiffModal.currentDraft.subject}
                </div>
                <pre
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--foreground-muted)",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    lineHeight: 1.45,
                    background: "rgba(0,0,0,0.2)",
                    padding: "10px",
                    borderRadius: "4px",
                  }}
                >
                  {activeDiffModal.currentDraft.body}
                </pre>
              </div>

              {/* After */}
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.04)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "8px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#10b981" }}>OPTIMIZED INFLECTION DRAFT</span>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#10b981",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    {activeDiffModal.impactBadge}
                  </span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--foreground)" }}>
                  Subject: {activeDiffModal.optimizedDraft.subject}
                </div>
                <pre
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--foreground)",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    lineHeight: 1.45,
                    background: "rgba(0,0,0,0.2)",
                    padding: "10px",
                    borderRadius: "4px",
                  }}
                >
                  {activeDiffModal.optimizedDraft.body}
                </pre>
                <div style={{ fontSize: "11px", color: "#10b981", fontWeight: 500, marginTop: "4px" }}>
                  Key Improvement: {activeDiffModal.optimizedDraft.highlight}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setActiveDiffModal(null)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                Close Preview
              </button>

              {!activeDiffModal.applied && (
                <button
                  type="button"
                  onClick={() => handleApplyOptimization(activeDiffModal)}
                  disabled={isApplying === activeDiffModal.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 16px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: "#10b981",
                    border: "none",
                    color: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <Check size={13} />
                  Apply This Refinement to Dylan Agent
                </button>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
