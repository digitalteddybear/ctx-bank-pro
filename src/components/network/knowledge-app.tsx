"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Bell,
  BookOpenText,
  Building2,
  Boxes,
  ChevronDown,
  CircleDot,
  Database,
  FileArchive,
  FileCheck2,
  FileClock,
  FileText,
  GitBranch,
  Home,
  Menu,
  Network,
  PanelLeftOpen,
  Search,
  Server,
  Settings,
  Bot,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Button as AstryxButton } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Token } from "@astryxdesign/core/Token";
import { BootSequence } from "./boot-sequence";
import { CommandPalette } from "./command-palette";
import { DocumentUpload } from "./document-upload";
import { LeadColumns } from "./lead-columns";
import { NeuralGraph } from "./neural-graph";
import { NodeInspector } from "./node-inspector";
import { calculateMetrics, getActiveGraph } from "@/lib/graph/engine";
import { nodeTypeColors, nodeTypeLabels } from "@/lib/graph/palette";
import { useGraphStore, type ViewMode } from "@/lib/graph/store";
import type { GraphMetrics, GraphSnapshot, NodeType } from "@/lib/graph/types";
import { Badge, Button, IconButton, Panel } from "@/components/ui/primitives";
import { ThemeAwareBrand } from "@/components/ui/theme-aware-brand";
import { ThemePreferenceControl } from "@/components/ui/theme-switch";
import { AreaChart } from "@/components/dither-kit/area-chart";
import { Area } from "@/components/dither-kit/area";
import { Grid } from "@/components/dither-kit/grid";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
const ArchitectureView=dynamic(()=>import("@/components/templates/architecture/architecture-view").then(module=>module.ArchitectureView));
const AgentsView=dynamic(()=>import("./agents-view").then(module=>module.AgentsView));
import { ShellSideNavigation } from "./shell-side-navigation";
import { MissionControlView } from "./mission-control-view";
import { CatalogDashboardView } from "./catalog-dashboard-view";
import { DashboardAlertRailView } from "./dashboard-alert-rail-view";
const AISettingsView=dynamic(()=>import("./ai-settings-view").then(module=>module.AISettingsView));
const AIChatConversationView=dynamic(()=>import("@/components/templates/ai-chat/ai-chat-conversation-view").then(module=>module.AIChatConversationView));
import { useAIChatStore } from "@/lib/ai-chat-store";

const navItems = [
  { id: "dashboard", label: "Home Dashboard", icon: Home },
  { id: "network", label: "Knowledge Bank", icon: Network },
  { id: "sources", label: "Documents & Sources", icon: Database },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "architecture", label: "Architecture", icon: GitBranch },
] as const;

const pageTitleByView = {
  dashboard: "Home",
  network: "Knowledge Bank",
  sources: "Documents & Sources",
  agents: "Agents",
  architecture: "Architecture",
  catalog: "System Catalog",
  "ai-settings": "AI Settings",
  "ai-chat": "Chat",
} as const;

const documentProcessingChartConfig = {
  documents: { label: "Documents", color: "blue" },
} as const;

interface DocumentSummary {
  id: string;
  originalName: string;
  extension: string;
  sizeBytes: number;
  status: "ready_for_agent" | "processed" | "failed";
  uploadedAt: string;
  completedAt?: string;
  extractedCharacters: number;
  chunkCount: number;
  sourceNodeId?: string;
  error?: string;
}

interface RuntimeStatus {
  corpus: {
    sourceCount: number;
    textualCount: number;
    totalBytes: number;
    indexedAt: string | null;
    byExtension: Record<string, number>;
  };
  ingestion: {
    total: number;
    pending: number;
    processed: number;
    failed: number;
  };
  persistence: string;
}

function CompanyProfileOverlay({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="info" width={400}>
      <DialogHeader
        onOpenChange={onOpenChange}
        startContent={<Building2 size={18} />}
        subtitle="Organization profile"
        title="ASP Private Capital"
      />
      <p>ASP Private Capital is the active organization for this Context Bank workspace.</p>
      <dl>
        <div><dt>Organization</dt><dd>ASP Private Capital</dd></div>
        <div><dt>Workspace</dt><dd>Context Bank</dd></div>
      </dl>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  accent: string;
  onClick: () => void;
}) {
  return (
    <ClickableCard
      className="panel metric-card"
      label={`${label}: ${value}. ${detail}`}
      onClick={onClick}
      padding={4}
    >
      <div className="metric-card__top">
        <span className="metric-card__label">{label}</span>
        <span className="metric-card__icon" style={{ color: accent }}>
          <Icon size={16} />
        </span>
      </div>
      <Heading level={2}>{value}</Heading>
      <span className="metric-card__detail">
        <span style={{ backgroundColor: accent }} />
        {detail}
      </span>
    </ClickableCard>
  );
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Not loaded";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSyncState(state: "connecting" | "live" | "stale" | "error") {
  if (state === "live") return "Up to date";
  if (state === "connecting") return "Connecting";
  if (state === "stale") return "Update delayed";
  return "Refresh failed";
}

function formatDocumentStatus(status: DocumentSummary["status"]) {
  if (status === "ready_for_agent") return "Awaiting agent";
  if (status === "processed") return "Processed";
  return "Text extraction failed";
}

function formatNodeStatus(status: string) {
  if (status === "review") return "Awaiting review";
  return status.replaceAll("_", " ");
}

function formatStorageMode(mode: string | undefined) {
  return mode === "memory" ? "Memory only" : "Local file";
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** power).toFixed(power > 1 ? 1 : 0)} ${units[power]}`;
}

function DashboardView({
  metrics,
  runtime,
  documents,
  onComplete,
}: {
  metrics: GraphMetrics;
  runtime: RuntimeStatus | null;
  documents: DocumentSummary[];
  onComplete: () => Promise<void> | void;
}) {
  const snapshot = useGraphStore((state) => state.snapshot);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const selectNode = useGraphStore((state) => state.selectNode);
  const syncState = useGraphStore((state) => state.syncState);
  const lastSyncedAt = useGraphStore((state) => state.lastSyncedAt);
  const active = getActiveGraph(snapshot);
  const pendingDocuments = documents.filter((document) => document.status === "ready_for_agent");
  const documentProcessingTrend = useMemo(() => [
    { stage: "Queued", documents: runtime?.ingestion.pending ?? pendingDocuments.length },
    { stage: "Processed", documents: runtime?.ingestion.processed ?? 0 },
    { stage: "Issues", documents: runtime?.ingestion.failed ?? 0 },
  ], [pendingDocuments.length, runtime]);

  return (
    <motion.main
      className="dashboard"
      style={{ padding: 0, minHeight: "auto", width: "100%" }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <section className="metric-grid" aria-label="Knowledge base status">
        <MetricCard
          label="Active nodes"
          value={metrics.activeNodes}
          detail="Available for search and traversal"
          icon={CircleDot}
          accent="#58D3DB"
          onClick={() => setViewMode("network")}
        />
        <MetricCard
          label="Active links"
          value={metrics.relationships}
          detail="Active links between nodes"
          icon={GitBranch}
          accent="#00B87A"
          onClick={() => setViewMode("network")}
        />
        <MetricCard
          label="Indexed files"
          value={runtime?.corpus.sourceCount ?? "—"}
          detail={`${runtime?.corpus.textualCount ?? 0} text-format files`}
          icon={FileArchive}
          accent="#58D3DB"
          onClick={() => setViewMode("sources")}
        />
        <MetricCard
          label="Awaiting agent processing"
          value={runtime?.ingestion.pending ?? pendingDocuments.length}
          detail={`${runtime?.ingestion.processed ?? 0} uploaded documents processed`}
          icon={FileClock}
          accent="#F7B928"
          onClick={() => setViewMode("sources")}
        />
      </section>

      <section className="dashboard-grid dashboard-grid--observatory">
        <Panel className="network-preview">
          <div className="panel-heading panel-heading--overlay">
            <div>
              <Heading level={2}>Knowledge Bank</Heading>
              <Text color="secondary" type="supporting">Active neural graph traversal and concept clusters.</Text>
            </div>
            <div className="panel-heading__meta">
              <Button size="sm" variant="secondary" onClick={() => setViewMode("network")}>
                <Network size={14} />
                Open Knowledge Bank
              </Button>
            </div>
          </div>
          <NeuralGraph compact />
          <div className="network-preview__footer">
            <span>{metrics.activeNodes} nodes · {metrics.relationships} relationships</span>
            <span>Data updated {formatTimestamp(snapshot.generatedAt)}</span>
          </div>
        </Panel>

        <div className="dashboard-side dashboard-side--observatory">
          <Panel className="runtime-panel">
            <div className="panel-heading">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Heading level={2}>Backend status</Heading>
                  <span className="backend-live-indicator">Live<i /></span>
                </div>
                <Text color="secondary" type="supporting">Telemetry synchronization and persistence mode.</Text>
              </div>
              <Server size={16} style={{ color: "var(--foreground-muted)" }} />
            </div>
            <dl className="runtime-facts">
              <div>
                <dt>Graph data</dt>
                <dd data-state={syncState}>{formatSyncState(syncState)}</dd>
              </div>
              <div>
                <dt>Last refresh</dt>
                <dd>{formatTimestamp(lastSyncedAt)}</dd>
              </div>
              <div>
                <dt>Storage mode</dt>
                <dd>{formatStorageMode(runtime?.persistence)}</dd>
              </div>
              <div>
                <dt>Indexed file size</dt>
                <dd>{formatBytes(runtime?.corpus.totalBytes ?? 0)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel className="activity-panel activity-panel--agent">
            <div className="panel-heading">
              <div>
                <Heading level={2}>Graph change history</Heading>
                <Text color="secondary" type="supporting">Recent mutations by agents and operators.</Text>
              </div>
              <Activity size={16} style={{ color: "var(--foreground-muted)" }} />
            </div>
            <div className="activity-list">
              {snapshot.activities.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    selectNode(item.subjectId);
                    setViewMode("network");
                  }}
                >
                  <span className={`activity-icon activity-icon--${item.action}`}>
                    {item.action === "linked" ? <GitBranch size={13} /> : <FileCheck2 size={13} />}
                  </span>
                  <span>
                    <strong>{item.subjectLabel}</strong>
                    <small>{item.actor} · {item.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section className="dashboard-bottom dashboard-bottom--observatory">
        <Panel className="knowledge-distribution">
          <div className="panel-heading">
            <div>
              <Heading level={2}>Active nodes</Heading>
              <Text color="secondary" type="supporting">Distribution across entity types.</Text>
            </div>
            <Boxes size={16} style={{ color: "var(--foreground-muted)" }} />
          </div>
          <div className="distribution-list">
            {Object.entries(
              active.nodes.reduce<Record<string, number>>((acc, node) => {
                acc[node.type] = (acc[node.type] ?? 0) + 1;
                return acc;
              }, {}),
            )
              .sort(([, a], [, b]) => b - a)
              .slice(0, 8)
              .map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => setViewMode("network")}
                  style={{ "--type-color": nodeTypeColors[type as NodeType] } as React.CSSProperties}
                >
                  <span />
                  <strong>{nodeTypeLabels[type as NodeType]}</strong>
                  <small>{count}</small>
                </button>
              ))}
          </div>
        </Panel>

        <Panel className="ingestion-panel">
          <div className="panel-heading">
            <div>
              <Heading level={2}>Document processing</Heading>
              <Text color="secondary" type="supporting">Extraction queue and chunk ingestion status.</Text>
            </div>
            <div className="panel-heading__meta">
              <DocumentUpload onComplete={onComplete} />
            </div>
          </div>
          <p>
            The server extracts text from uploaded files and divides it into chunks. Agents
            read those chunks, create nodes and links, then mark each document as processed.
          </p>
          <div className="processing-chart" aria-label="Document processing distribution">
            <AreaChart
              animate
              bloom="low"
              config={documentProcessingChartConfig}
              data={documentProcessingTrend}
              margins={{ left: 28, right: 12, top: 8 }}
            >
              <Grid />
              <XAxis dataKey="stage" />
              <YAxis tickCount={3} />
              <Tooltip labelKey="stage" />
              <Area dataKey="documents" variant="dotted" />
            </AreaChart>
          </div>
          <div className="ingestion-summary">
            <span><strong>{runtime?.ingestion.pending ?? 0}</strong> awaiting agent processing</span>
            <span><strong>{runtime?.ingestion.failed ?? 0}</strong> text-extraction failures</span>
          </div>
        </Panel>
      </section>
    </motion.main>
  );
}

function NetworkView() {
  const setCommandOpen = useGraphStore((state) => state.setCommandOpen);
  const [renderer, setRenderer] = useState<"map" | "spatial">("spatial");

  return (
    <motion.main
      className="workspace workspace--network"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="network-canvas-heading">
        <div className="network-canvas-actions">
          <SegmentedControl
            className="network-view-toggle"
            label="Knowledge Bank renderer"
            onChange={(value) => setRenderer(value as "map" | "spatial")}
            size="sm"
            value={renderer}
          >
            <SegmentedControlItem label="2D map" value="map" />
            <SegmentedControlItem label="3D graph" value="spatial" />
          </SegmentedControl>
          <Button className="network-search" size="sm" variant="secondary" onClick={() => setCommandOpen(true)}>
            <Search size={15} />
            Search nodes
            <kbd>⌘ K</kbd>
          </Button>
        </div>
      </div>
      <div className="network-stage">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            animate={{ opacity: 1 }}
            className="graph-renderer"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={renderer}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            {renderer === "map" ? <LeadColumns /> : <NeuralGraph />}
          </motion.div>
        </AnimatePresence>
        {renderer === "spatial" && <div className="network-legend">
          {(["framework", "offer", "system", "source", "claim"] as NodeType[]).map((type) => (
            <span key={type}>
              <i style={{ backgroundColor: nodeTypeColors[type] }} />
              {nodeTypeLabels[type]}
            </span>
          ))}
        </div>}
      </div>
    </motion.main>
  );
}

function SourcesView({ documents, onComplete }: { documents: DocumentSummary[]; onComplete: () => Promise<void> | void }) {
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const sourceNodes = snapshot.nodes.filter((node) => node.type === "source" && !node.deletedAt);

  return (
    <motion.main
      className="workspace sources-view"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "28px",
        padding: "36px 40px 60px 40px",
        maxWidth: "1500px",
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Top Header & Actions matching Agents North Star */}
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
          <Heading level={1} id="sources-title">
            Documents & Sources
          </Heading>
          <Text color="secondary" type="body">
            Raw ingest artifacts, extracted knowledge claims, and source authority status.
          </Text>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <DocumentUpload onComplete={onComplete} />
        </div>
      </section>

      {documents.length > 0 ? (
        <Panel className="document-inbox" style={{ width: "100%" }}>
          <div className="panel-heading">
            <div>
              <Heading level={2}>Document processing queue</Heading>
              <Text color="secondary" type="supporting">
                Ingestion queue and agent extraction progress.
              </Text>
            </div>
            <FileClock size={16} style={{ color: "var(--foreground-muted)" }} />
          </div>
          <div className="document-inbox__list">
            {documents.map((document) => (
              <button
                key={document.id}
                disabled={!document.sourceNodeId}
                onClick={() => {
                  if (!document.sourceNodeId) return;
                  selectNode(document.sourceNodeId);
                  setViewMode("network");
                }}
              >
                <FileText size={16} />
                <span>
                  <strong>{document.originalName}</strong>
                  <small>
                    {document.chunkCount} chunks · {formatBytes(document.sizeBytes)} ·{" "}
                    {formatTimestamp(document.uploadedAt)}
                  </small>
                </span>
                <Badge
                  tone={
                    document.status === "processed"
                      ? "success"
                      : document.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {formatDocumentStatus(document.status)}
                </Badge>
              </button>
            ))}
          </div>
        </Panel>
      ) : (
        <EmptyState
          actions={
            <Button onClick={() => setViewMode("network")} variant="secondary">
              Explore Knowledge Bank
            </Button>
          }
          description="Upload a document from the global action bar to create a source record and start the ingestion workflow."
          headingLevel={2}
          icon={<FileArchive size={24} />}
          title="No uploaded documents yet"
        />
      )}

      {sourceNodes.length > 0 ? (
        <Panel className="source-table" style={{ width: "100%" }}>
          <div className="panel-heading" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div>
              <Heading level={2}>Source Nodes</Heading>
              <Text color="secondary" type="supporting">
                Active verified knowledge sources linked in ASP Private Capital.
              </Text>
            </div>
            <Database size={16} style={{ color: "var(--foreground-muted)" }} />
          </div>
          <div className="source-table__head">
            <span>Source node</span>
            <span>Authority level</span>
            <span>Links</span>
            <span>Status</span>
            <span />
          </div>
          {sourceNodes.map((node, index) => {
          const linked = snapshot.links.filter(
            (link) => !link.deletedAt && (link.source === node.id || link.target === node.id),
          ).length;
          return (
            <button
              className="source-table__row"
              key={node.id}
              onClick={() => {
                selectNode(node.id);
                setViewMode("network");
              }}
            >
              <span className="source-table__title">
                <i><FileText size={16} /></i>
                <span>
                  <strong>{node.label}</strong>
                  <small>{node.sources[0]?.path ?? "No file path recorded"}</small>
                </span>
              </span>
              <span className="source-table__authority">{node.authority}</span>
              <span className="source-table__coverage">{linked} typed links</span>
              <span>
                <Badge tone={node.status === "verified" ? "success" : "warning"}>
                  {formatNodeStatus(node.status)}
                </Badge>
              </span>
              <span className="source-table__index">{String(index + 1).padStart(2, "0")}</span>
            </button>
          );
          })}
        </Panel>
      ) : (
        <EmptyState
          description="Source nodes appear here once a document has been uploaded and added to the Knowledge Bank."
          headingLevel={2}
          icon={<Database size={24} />}
          isCompact
          title="No source nodes available"
        />
      )}
    </motion.main>
  );
}

export function KnowledgeApp() {
  const snapshot = useGraphStore((state) => state.snapshot);
  const viewMode = useGraphStore((state) => state.viewMode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const selectedChatId = useGraphStore((state) => state.selectedChatId);
  const setSelectedChatId = useGraphStore((state) => state.setSelectedChatId);
  const hydrateChats = useAIChatStore((state) => state.hydrate);
  useEffect(() => {
    hydrateChats();
    const refreshChats = () => { void useAIChatStore.getState().refresh(); };
    window.addEventListener("ctx:backend-updated", refreshChats);
    const onPopState = () => {
      const url = new URL(window.location.href);
      const requested = url.searchParams.get("view");
      if (requested && ["dashboard", "network", "sources", "agents", "architecture", "catalog", "ai-settings", "ai-chat"].includes(requested)) setViewMode(requested as ViewMode);
      setSelectedChatId(url.searchParams.get("chat"));
    };
    window.addEventListener("popstate", onPopState);
    const url = new URL(window.location.href);
    const chatId = url.searchParams.get("chat");
    if (url.searchParams.get("view") === "ai-chat" && chatId) setSelectedChatId(chatId);
    const requested = new URLSearchParams(window.location.search).get("view");
    if (
      requested &&
      ["dashboard", "network", "sources", "agents", "architecture", "catalog", "ai-settings", "ai-chat"].includes(requested)
    ) {
      setViewMode(requested as ViewMode);
    }
    return () => { window.removeEventListener("popstate", onPopState); window.removeEventListener("ctx:backend-updated", refreshChats); };
  }, [hydrateChats, setSelectedChatId, setViewMode]);
  const setCommandOpen = useGraphStore((state) => state.setCommandOpen);
  const setSnapshot = useGraphStore((state) => state.setSnapshot);
  const setSyncState = useGraphStore((state) => state.setSyncState);
  const [booted, setBooted] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const sidebarOpen = useGraphStore((state) => state.sidebarOpen);
  const toggleSidebar = useGraphStore((state) => state.toggleSidebar);
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [profileRole, setProfileRole] = useState<"administrator" | "guest">("guest");
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/session", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Session unavailable");
      const result: unknown = await response.json();
      if (active && result && typeof result === "object" && "role" in result && result.role === "administrator") setProfileRole("administrator");
      if (active) setProfileReady(true);
    }).catch(() => { if (active) setProfileReady(true); });
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => calculateMetrics(snapshot), [snapshot]);

  useEffect(() => {
    document.title = `${pageTitleByView[viewMode]} | CTX BankPro | ASP Private Capital`;
  }, [viewMode]);

  useEffect(() => {
    if (profileReady && profileRole === "guest" && viewMode !== "dashboard") {
      setSelectedChatId(null);
      setViewMode("dashboard");
      window.history.replaceState({}, "", "/?view=dashboard");
    }
  }, [profileReady, profileRole, setSelectedChatId, setViewMode, viewMode]);

  const syncBackend = useCallback(async () => {
    if (!profileReady) return;
    try {
      if (profileRole === "guest") {
        const response = await fetch("/api/status", { cache: "no-store" });
        if (!response.ok) throw new Error("Backend sync failed");
        setRuntime(await response.json() as RuntimeStatus);
        return;
      }
      const [graphResponse, statusResponse, documentsResponse] = await Promise.all([
        fetch("/api/graph", { cache: "no-store" }),
        fetch("/api/status", { cache: "no-store" }),
        fetch("/api/documents", { cache: "no-store" }),
      ]);
      if (!graphResponse.ok || !statusResponse.ok || !documentsResponse.ok) {
        throw new Error("Backend sync failed");
      }
      const [graph, status, ingestionDocuments] = await Promise.all([
        graphResponse.json() as Promise<GraphSnapshot>,
        statusResponse.json() as Promise<RuntimeStatus>,
        documentsResponse.json() as Promise<DocumentSummary[]>,
      ]);
      setSnapshot(graph);
      setRuntime(status);
      setDocuments(ingestionDocuments);
      window.dispatchEvent(new Event("ctx:backend-updated"));
    } catch {
      setSyncState("error");
    }
  }, [profileReady, profileRole, setRuntime, setSnapshot, setSyncState]);

  useEffect(() => {
    if (!profileReady) return;
    const initialSync = window.setTimeout(() => void syncBackend(), 0);
    const interval = window.setInterval(() => void syncBackend(), 4_000);
    const onFocus = () => void syncBackend();
    window.addEventListener("focus", onFocus);
    window.addEventListener("ctx:backend-sync", onFocus);
    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ctx:backend-sync", onFocus);
    };
  }, [profileReady, syncBackend]);

  useEffect(() => {
    if (profileReady && profileRole === "administrator") hydrateChats();
  }, [hydrateChats, profileReady, profileRole]);

  useEffect(() => {
    const start = Date.now();
    const duration = 900;
    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      setBootProgress(progress);
    };
    tick();
    const interval = window.setInterval(tick, 50);
    const completion = window.setTimeout(() => {
      setBootProgress(1);
      setBooted(true);
    }, duration);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(completion);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandOpen, toggleSidebar]);

  return (
    <>
      <AnimatePresence>{!booted && <BootSequence progress={bootProgress} />}</AnimatePresence>
      <div className={`app-shell ${booted ? "is-ready" : ""}`} style={{ height: "100vh", overflow: "hidden" }}>
        <AppShell
          variant="wash"
          contentPadding={0}
          height="fill"
          sideNav={
            <ShellSideNavigation
              profileRole={profileRole}
              onOpenCompanyProfile={() => setCompanyProfileOpen(true)}
              onOpenThemeSettings={() => setThemeSettingsOpen(true)}
            />
          }
        >
          <div
            className="main-scroll-container"
            style={{
              height: "100%",
              width: "100%",
              overflowY: "auto",
              position: "relative",
              backgroundColor: "var(--background)",
            }}
          >
            {!sidebarOpen && (
              <button
                type="button"
                onClick={toggleSidebar}
                className="sidebar-toggle-trigger"
                aria-label="Expand navigation (⌘B)"
                title="Expand navigation (⌘B)"
                style={{
                  position: "fixed",
                  top: "16px",
                  left: "16px",
                  zIndex: 40,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  fontSize: "12px",
                  fontWeight: 600,
                  transition: "all 150ms ease",
                }}
              >
                <PanelLeftOpen size={16} />
                <span>Navigation</span>
                <kbd style={{ fontSize: "10px", opacity: 0.6, background: "var(--secondary)", padding: "2px 5px", borderRadius: "4px" }}>⌘B</kbd>
              </button>
            )}
            {viewMode === "ai-chat" && profileRole === "administrator" && <AIChatConversationView conversationId={selectedChatId} onMissionControl={() => { setSelectedChatId(null); setViewMode("dashboard"); window.history.pushState({}, "", "/?view=dashboard"); }} />}
            {viewMode === "dashboard" && (
              <div
                className="dashboard-workspace-wrap"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "28px",
                  padding: "36px 40px 60px 40px",
                  maxWidth: "1500px",
                  margin: "0 auto",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                {profileRole === "administrator" ? <>
                  <MissionControlView metrics={metrics} runtime={runtime} documents={documents} onComplete={syncBackend} />
                  <DashboardAlertRailView onComplete={syncBackend} />
                  <DashboardView metrics={metrics} runtime={runtime} documents={documents} onComplete={syncBackend} />
                </> : <Card padding={4}><VStack gap={3}>
                  <Heading level={1}>Mission Control</Heading>
                  <Text color="secondary">You are signed in with guest access. This dashboard is read-only.</Text>
                  <VStack gap={2}>
                    <HStack gap={3} hAlign="between"><Text type="label">Dashboard</Text><Text color="secondary">Available</Text></HStack>
                    <HStack gap={3} hAlign="between"><Text type="label">Agents</Text><Text color="secondary">Administrator access required</Text></HStack>
                    <HStack gap={3} hAlign="between"><Text type="label">Knowledge Bank</Text><Text color="secondary">Administrator access required</Text></HStack>
                  </VStack>
                </VStack></Card>}
              </div>
            )}
            {viewMode === "network" && <NetworkView />}
            {viewMode === "sources" && <SourcesView documents={documents} onComplete={syncBackend} />}
            {viewMode === "agents" && <AgentsView />}
            {viewMode === "architecture" && (
              <div
                className="architecture-workspace-wrap"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "28px",
                  padding: "36px 40px 60px 40px",
                  maxWidth: "1500px",
                  margin: "0 auto",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <ArchitectureView />
              </div>
            )}
            {viewMode === "catalog" && <CatalogDashboardView />}
            {viewMode === "ai-settings" && <div className="ai-settings-workspace-wrap"><AISettingsView /></div>}
          </div>
        </AppShell>

        <NodeInspector />
        <CommandPalette />
        <CompanyProfileOverlay isOpen={companyProfileOpen} onOpenChange={setCompanyProfileOpen} />
        <Dialog isOpen={themeSettingsOpen} onOpenChange={setThemeSettingsOpen} purpose="info" width={400}>
          <DialogHeader
            onOpenChange={setThemeSettingsOpen}
            startContent={<Settings size={18} />}
            subtitle="Workspace appearance"
            title="Display settings"
          />
          <ThemePreferenceControl />
        </Dialog>
      </div>
    </>
  );
}
