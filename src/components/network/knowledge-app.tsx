"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Boxes,
  CircleDot,
  Command,
  Database,
  FileArchive,
  FileCheck2,
  FileClock,
  FileText,
  GitBranch,
  Home,
  Network,
  Search,
  Server,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BootSequence } from "./boot-sequence";
import { CommandPalette } from "./command-palette";
import { DocumentUpload } from "./document-upload";
import { NeuralGraph } from "./neural-graph";
import { NodeInspector } from "./node-inspector";
import { calculateMetrics, getActiveGraph } from "@/lib/graph/engine";
import { nodeTypeColors, nodeTypeLabels } from "@/lib/graph/palette";
import { useGraphStore } from "@/lib/graph/store";
import type { GraphMetrics, GraphSnapshot, NodeType } from "@/lib/graph/types";
import { Badge, Button, IconButton, Panel } from "@/components/ui/primitives";

const navItems = [
  { id: "dashboard", label: "Knowledge observatory", icon: Home },
  { id: "network", label: "Neural network", icon: Network },
  { id: "sources", label: "Source registry", icon: Database },
] as const;

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

function WorldCreatorsMark() {
  return (
    <div className="wc-mark" aria-label="World Creators">
      <svg viewBox="0 0 42 24" role="img" aria-hidden="true">
        <path
          d="M2 13.8 10.1 5.7c1.5-1.5 3.9-1.5 5.4 0l4 4 6.1-6.1c1.5-1.5 3.9-1.5 5.4 0l1.4 1.4-10.2 10.2c-1.5 1.5-3.9 1.5-5.4 0l-4-4-5.4 5.4c-1.5 1.5-3.9 1.5-5.4 0L2 13.8Z"
          fill="currentColor"
        />
        <path
          d="m40 10.2-8.1 8.1c-1.5 1.5-3.9 1.5-5.4 0l-1.4-1.4L35.3 6.7c1.5-1.5 3.9-1.5 5.4 0l.7.7L40 10.2Z"
          fill="currentColor"
          opacity=".58"
        />
      </svg>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  accent: string;
}) {
  return (
    <Panel className="metric-card">
      <div className="metric-card__top">
        <span className="metric-card__label">{label}</span>
        <span className="metric-card__icon" style={{ color: accent }}>
          <Icon size={16} />
        </span>
      </div>
      <strong>{value}</strong>
      <span className="metric-card__detail">
        <span style={{ backgroundColor: accent }} />
        {detail}
      </span>
    </Panel>
  );
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Awaiting sync";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
}: {
  metrics: GraphMetrics;
  runtime: RuntimeStatus | null;
  documents: DocumentSummary[];
}) {
  const snapshot = useGraphStore((state) => state.snapshot);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const selectNode = useGraphStore((state) => state.selectNode);
  const syncState = useGraphStore((state) => state.syncState);
  const lastSyncedAt = useGraphStore((state) => state.lastSyncedAt);
  const active = getActiveGraph(snapshot);
  const pendingDocuments = documents.filter((document) => document.status === "ready_for_agent");

  return (
    <motion.main
      className="workspace dashboard"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">Agent-maintained knowledge system</div>
          <h1>Knowledge base observatory</h1>
          <p>Read-only visibility into the graph, source corpus, ingestion queue and agent activity.</p>
        </div>
        <div className="workspace-heading__actions">
          <Button variant="secondary" onClick={() => setViewMode("network")}>
            Explore network
            <Network size={15} />
          </Button>
        </div>
      </div>

      <section className="metric-grid" aria-label="Knowledge base status">
        <MetricCard
          label="Graph knowledge"
          value={metrics.activeNodes}
          detail="Active semantic nodes"
          icon={CircleDot}
          accent="#71D0E7"
        />
        <MetricCard
          label="Relationships"
          value={metrics.relationships}
          detail="Typed traversal paths"
          icon={GitBranch}
          accent="#5ED5C8"
        />
        <MetricCard
          label="Indexed filebase"
          value={runtime?.corpus.sourceCount ?? "—"}
          detail={`${runtime?.corpus.textualCount ?? 0} directly text-readable`}
          icon={FileArchive}
          accent="#71B8FF"
        />
        <MetricCard
          label="Agent ingestion queue"
          value={runtime?.ingestion.pending ?? pendingDocuments.length}
          detail={`${runtime?.ingestion.processed ?? 0} uploads processed`}
          icon={FileClock}
          accent="#F6B55D"
        />
      </section>

      <section className="dashboard-grid dashboard-grid--observatory">
        <Panel className="network-preview">
          <div className="panel-heading panel-heading--overlay">
            <div>
              <div className="section-label">Live backend topology</div>
              <h2>Neural field</h2>
            </div>
            <div className="panel-heading__meta">
              <button onClick={() => setViewMode("network")}>Expand</button>
            </div>
          </div>
          <NeuralGraph compact />
          <div className="network-preview__footer">
            <span>{metrics.activeNodes} nodes · {metrics.relationships} relationships</span>
            <span>Backend snapshot {formatTimestamp(snapshot.generatedAt)}</span>
          </div>
        </Panel>

        <div className="dashboard-side dashboard-side--observatory">
          <Panel className="runtime-panel">
            <div className="panel-heading">
              <div>
                <div className="section-label">Runtime</div>
                <h2>Dynamic graph projection</h2>
              </div>
              <Server size={17} />
            </div>
            <dl className="runtime-facts">
              <div>
                <dt>Frontend sync</dt>
                <dd data-state={syncState}>{syncState}</dd>
              </div>
              <div>
                <dt>Last polled</dt>
                <dd>{formatTimestamp(lastSyncedAt)}</dd>
              </div>
              <div>
                <dt>Persistence</dt>
                <dd>{runtime?.persistence ?? "file"}</dd>
              </div>
              <div>
                <dt>Corpus size</dt>
                <dd>{formatBytes(runtime?.corpus.totalBytes ?? 0)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel className="activity-panel activity-panel--agent">
            <div className="panel-heading">
              <div>
                <div className="section-label">Agent and ingestion activity</div>
                <h2>Backend change feed</h2>
              </div>
              <Activity size={17} />
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
              <div className="section-label">Ontology coverage</div>
              <h2>Knowledge distribution</h2>
            </div>
            <Boxes size={17} />
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
              <div className="section-label">RAG workflow</div>
              <h2>Document ingestion</h2>
            </div>
            <FileArchive size={17} />
          </div>
          <p>
            Human uploads are extracted and chunked on this host. Agents read the queue,
            derive knowledge and relationships, then complete each ingestion record.
          </p>
          <div className="ingestion-summary">
            <span><strong>{runtime?.ingestion.pending ?? 0}</strong> ready for agents</span>
            <span><strong>{runtime?.ingestion.failed ?? 0}</strong> extraction exceptions</span>
          </div>
        </Panel>
      </section>
    </motion.main>
  );
}

function NetworkView() {
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selected = snapshot.nodes.find((node) => node.id === selectedNodeId);
  const setCommandOpen = useGraphStore((state) => state.setCommandOpen);

  return (
    <motion.main
      className="workspace workspace--network"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="network-canvas-heading">
        <div>
          <div className="eyebrow">Agent-maintained topology</div>
          <h1>{selected?.label ?? "World Creators network"}</h1>
        </div>
        <button className="network-search" onClick={() => setCommandOpen(true)}>
          <Search size={15} />
          Find knowledge
          <kbd>⌘ K</kbd>
        </button>
      </div>
      <div className="network-stage">
        <NeuralGraph />
        <div className="network-legend">
          {(["framework", "offer", "system", "source", "claim"] as NodeType[]).map((type) => (
            <span key={type}>
              <i style={{ backgroundColor: nodeTypeColors[type] }} />
              {nodeTypeLabels[type]}
            </span>
          ))}
        </div>
      </div>
    </motion.main>
  );
}

function SourcesView({ documents }: { documents: DocumentSummary[] }) {
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const sourceNodes = snapshot.nodes.filter((node) => node.type === "source" && !node.deletedAt);

  return (
    <motion.main
      className="workspace sources-view"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">Evidence and ingestion</div>
          <h1>Source registry</h1>
          <p>Inspect uploaded evidence and trace graph knowledge back to source material.</p>
        </div>
        <Badge tone="cyan">{documents.length} uploaded documents</Badge>
      </div>

      {documents.length > 0 && (
        <Panel className="document-inbox">
          <div className="panel-heading">
            <div>
              <div className="section-label">Human-supplied evidence</div>
              <h2>Agent ingestion inbox</h2>
            </div>
            <FileClock size={17} />
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
                  {document.status.replaceAll("_", " ")}
                </Badge>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="source-table">
        <div className="source-table__head">
          <span>Graph source</span>
          <span>Authority</span>
          <span>Connections</span>
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
                  <small>{node.sources[0]?.path ?? "Derived knowledge source"}</small>
                </span>
              </span>
              <span className="source-table__authority">{node.authority}</span>
              <span className="source-table__coverage">{linked} typed links</span>
              <span>
                <Badge tone={node.status === "verified" ? "success" : "warning"}>
                  {node.status}
                </Badge>
              </span>
              <span className="source-table__index">{String(index + 1).padStart(2, "0")}</span>
            </button>
          );
        })}
      </Panel>
    </motion.main>
  );
}

export function KnowledgeApp() {
  const snapshot = useGraphStore((state) => state.snapshot);
  const viewMode = useGraphStore((state) => state.viewMode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const setCommandOpen = useGraphStore((state) => state.setCommandOpen);
  const setSnapshot = useGraphStore((state) => state.setSnapshot);
  const setSyncState = useGraphStore((state) => state.setSyncState);
  const syncState = useGraphStore((state) => state.syncState);
  const lastSyncedAt = useGraphStore((state) => state.lastSyncedAt);
  const [booted, setBooted] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);

  const metrics = useMemo(() => calculateMetrics(snapshot), [snapshot]);

  const syncBackend = useCallback(async () => {
    try {
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
    } catch {
      setSyncState("error");
    }
  }, [setSnapshot, setSyncState]);

  useEffect(() => {
    const initialSync = window.setTimeout(() => void syncBackend(), 0);
    const interval = window.setInterval(() => void syncBackend(), 4_000);
    const onFocus = () => void syncBackend();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [syncBackend]);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      setBootProgress(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setBooted(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandOpen]);

  return (
    <>
      <AnimatePresence>{!booted && <BootSequence progress={bootProgress} />}</AnimatePresence>
      <div className={`app-shell ${booted ? "is-ready" : ""}`}>
        <aside className="rail">
          <WorldCreatorsMark />
          <nav aria-label="Primary navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <IconButton
                  key={item.id}
                  label={item.label}
                  active={viewMode === item.id}
                  onClick={() => setViewMode(item.id)}
                >
                  <Icon size={18} />
                </IconButton>
              );
            })}
          </nav>
        </aside>

        <header className="topbar">
          <div className="product-name">
            <span>World Creators</span>
            <i />
            Knowledge Network
          </div>
          <button className="global-search" onClick={() => setCommandOpen(true)}>
            <Search size={15} />
            <span>Search the network</span>
            <kbd><Command size={11} /> K</kbd>
          </button>
          <div className="topbar__actions">
            <span className="backend-sync" data-state={syncState}>
              <i />
              {syncState === "live" ? `Synced ${formatTimestamp(lastSyncedAt)}` : syncState}
            </span>
            <DocumentUpload onComplete={syncBackend} />
          </div>
        </header>

        {viewMode === "dashboard" && (
          <DashboardView metrics={metrics} runtime={runtime} documents={documents} />
        )}
        {viewMode === "network" && <NetworkView />}
        {viewMode === "sources" && <SourcesView documents={documents} />}

        <NodeInspector />
        <CommandPalette />
      </div>
    </>
  );
}
