"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Bell,
  Boxes,
  CheckCircle2,
  CircleDot,
  Command,
  Database,
  FileClock,
  FileText,
  Gauge,
  GitBranch,
  Home,
  Network,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BootSequence } from "./boot-sequence";
import { CommandPalette } from "./command-palette";
import { NeuralGraph } from "./neural-graph";
import { NodeEditor } from "./node-editor";
import { NodeInspector } from "./node-inspector";
import { calculateMetrics, getActiveGraph } from "@/lib/graph/engine";
import { nodeTypeColors, nodeTypeLabels } from "@/lib/graph/palette";
import { useGraphStore } from "@/lib/graph/store";
import type { GraphMetrics, NodeType } from "@/lib/graph/types";
import { Badge, Button, IconButton, Panel } from "@/components/ui/primitives";

const navItems = [
  { id: "dashboard", label: "Intelligence dashboard", icon: Home },
  { id: "network", label: "Neural network", icon: Network },
  { id: "sources", label: "Source registry", icon: Database },
] as const;

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

function HealthBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="health-row">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="health-track">
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function DashboardView({
  metrics,
  onGraphReady,
}: {
  metrics: GraphMetrics;
  onGraphReady: () => void;
}) {
  const snapshot = useGraphStore((state) => state.snapshot);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const selectNode = useGraphStore((state) => state.selectNode);
  const active = getActiveGraph(snapshot);
  const authoritative = active.nodes.filter((node) => node.authority === "primary").length;

  return (
    <motion.main
      className="workspace dashboard"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">Knowledge intelligence</div>
          <h1>Good evening, World Creators.</h1>
          <p>The network is indexed, responsive, and ready for exploration.</p>
        </div>
        <div className="workspace-heading__actions">
          <Badge tone="success">
            <span className="status-pulse" />
            Network healthy
          </Badge>
          <Button variant="secondary" onClick={() => setViewMode("network")}>
            Open network
            <Network size={15} />
          </Button>
        </div>
      </div>

      <section className="metric-grid" aria-label="Knowledge network metrics">
        <MetricCard
          label="Active knowledge"
          value={metrics.activeNodes}
          detail={`${authoritative} primary-authority nodes`}
          icon={CircleDot}
          accent="#9B8BFF"
        />
        <MetricCard
          label="Relationships"
          value={metrics.relationships}
          detail="Typed, traversable connections"
          icon={GitBranch}
          accent="#5ED5C8"
        />
        <MetricCard
          label="Source coverage"
          value={`${metrics.sourceCoveragePercent}%`}
          detail="Records with traceable provenance"
          icon={FileText}
          accent="#71B8FF"
        />
        <MetricCard
          label="Review queue"
          value={metrics.pendingReview}
          detail={metrics.conflicts ? `${metrics.conflicts} unresolved conflicts` : "No active conflicts"}
          icon={ShieldAlert}
          accent="#F6B55D"
        />
      </section>

      <section className="dashboard-grid">
        <Panel className="network-preview">
          <div className="panel-heading panel-heading--overlay">
            <div>
              <div className="section-label">Live topology</div>
              <h2>Neural field</h2>
            </div>
            <div className="panel-heading__meta">
              <span><i className="live-dot" /> Live</span>
              <button onClick={() => setViewMode("network")}>Expand</button>
            </div>
          </div>
          <NeuralGraph compact onReady={onGraphReady} />
          <div className="network-preview__footer">
            <span>{metrics.activeNodes} nodes rendered</span>
            <span>WebGL accelerated</span>
          </div>
        </Panel>

        <div className="dashboard-side">
          <Panel className="health-panel">
            <div className="panel-heading">
              <div>
                <div className="section-label">Network health</div>
                <h2>Integrity signal</h2>
              </div>
              <Gauge size={17} />
            </div>
            <div className="health-score">
              <strong>{Math.round((metrics.verifiedPercent + metrics.sourceCoveragePercent) / 2)}</strong>
              <span>/ 100</span>
            </div>
            <HealthBar label="Knowledge verified" value={metrics.verifiedPercent} color="#72D8A2" />
            <HealthBar label="Source coverage" value={metrics.sourceCoveragePercent} color="#71B8FF" />
            <HealthBar label="Relationship integrity" value={96} color="#9B8BFF" />
          </Panel>

          <Panel className="activity-panel">
            <div className="panel-heading">
              <div>
                <div className="section-label">Recent activity</div>
                <h2>Network memory</h2>
              </div>
              <FileClock size={17} />
            </div>
            <div className="activity-list">
              {snapshot.activities.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    selectNode(item.subjectId);
                    setViewMode("network");
                  }}
                >
                  <span className={`activity-icon activity-icon--${item.action}`}>
                    {item.action === "linked" ? <GitBranch size={13} /> : <CheckCircle2 size={13} />}
                  </span>
                  <span>
                    <strong>{item.subjectLabel}</strong>
                    <small>{item.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section className="dashboard-bottom">
        <Panel className="knowledge-distribution">
          <div className="panel-heading">
            <div>
              <div className="section-label">Ontology</div>
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

        <Panel className="attention-panel">
          <div className="attention-panel__glow" />
          <div className="section-label">Operator attention</div>
          <h2>Evidence before expansion.</h2>
          <p>
            The commercial evidence gap remains the network’s highest-value open decision.
            Resolve it before promoting hypotheses into verified claims.
          </p>
          <button
            onClick={() => {
              selectNode("commercial-evidence-gap");
              setViewMode("network");
            }}
          >
            Review decision
            <Sparkles size={15} />
          </button>
        </Panel>
      </section>
    </motion.main>
  );
}

function NetworkView({ onGraphReady }: { onGraphReady: () => void }) {
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
          <div className="eyebrow">Live knowledge topology</div>
          <h1>{selected?.label ?? "World Creators network"}</h1>
        </div>
        <button className="network-search" onClick={() => setCommandOpen(true)}>
          <Search size={15} />
          Find knowledge
          <kbd>⌘ K</kbd>
        </button>
      </div>
      <div className="network-stage">
        <NeuralGraph onReady={onGraphReady} />
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

function SourcesView() {
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
          <div className="eyebrow">Evidence layer</div>
          <h1>Source registry</h1>
          <p>Trace every active claim, framework, and process to its underlying evidence.</p>
        </div>
        <Badge tone="cyan">{sourceNodes.length} indexed sources</Badge>
      </div>

      <Panel className="source-table">
        <div className="source-table__head">
          <span>Source</span>
          <span>Authority</span>
          <span>Coverage</span>
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
              <span className="source-table__coverage">
                <i><span style={{ width: `${Math.min(100, 42 + linked * 9)}%` }} /></i>
                {linked} links
              </span>
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
  const openCreateNode = useGraphStore((state) => state.openCreateNode);
  const undoLastMutation = useGraphStore((state) => state.undoLastMutation);
  const resetGraph = useGraphStore((state) => state.resetGraph);
  const lastMutation = useGraphStore((state) => state.lastMutation);
  const [booted, setBooted] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);

  const metrics = useMemo(() => calculateMetrics(snapshot), [snapshot]);

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && lastMutation) {
        event.preventDefault();
        undoLastMutation();
      }
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement;
        if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) openCreateNode();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lastMutation, openCreateNode, setCommandOpen, undoLastMutation]);

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
          <div className="rail__bottom">
            <IconButton label="Network settings">
              <Settings2 size={18} />
            </IconButton>
            <button className="operator-avatar" aria-label="Knowledge operator">
              WC
              <span />
            </button>
          </div>
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
            {lastMutation && (
              <IconButton label="Undo last change" onClick={undoLastMutation}>
                <Undo2 size={17} />
              </IconButton>
            )}
            <IconButton label="Reset local graph" onClick={resetGraph}>
              <RotateCcw size={17} />
            </IconButton>
            <IconButton label="Notifications">
              <Bell size={17} />
              <span className="notification-dot" />
            </IconButton>
            <Button size="sm" onClick={openCreateNode}>
              <Plus size={15} />
              Add knowledge
            </Button>
          </div>
        </header>

        {viewMode === "dashboard" && <DashboardView metrics={metrics} onGraphReady={() => undefined} />}
        {viewMode === "network" && <NetworkView onGraphReady={() => undefined} />}
        {viewMode === "sources" && <SourcesView />}

        <NodeInspector />
        <NodeEditor />
        <CommandPalette />
      </div>
    </>
  );
}
