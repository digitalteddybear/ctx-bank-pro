"use client";

import { useMemo } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  CircleDot,
  FileText,
  GitBranch,
  ShieldCheck,
  X,
} from "lucide-react";
import { getNeighborhood } from "@/lib/graph/engine";
import { nodeStatusColors, nodeTypeLabels } from "@/lib/graph/palette";
import { useGraphStore } from "@/lib/graph/store";
import { Badge, IconButton } from "@/components/ui/primitives";

const statusTone = {
  verified: "success",
  hypothesis: "warning",
  review: "cyan",
  conflicted: "danger",
  deprecated: "neutral",
} as const;

const statusLabel = {
  verified: "Verified",
  hypothesis: "Hypothesis",
  review: "Awaiting review",
  conflicted: "Conflicting records",
  deprecated: "Deprecated",
} as const;

export function NodeInspector() {
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const inspectorOpen = useGraphStore((state) => state.inspectorOpen);
  const setInspectorOpen = useGraphStore((state) => state.setInspectorOpen);
  const selectNode = useGraphStore((state) => state.selectNode);
  const node = snapshot.nodes.find((item) => item.id === selectedNodeId);
  const neighborhood = useMemo(
    () => (selectedNodeId ? getNeighborhood(snapshot, selectedNodeId, 1) : null),
    [selectedNodeId, snapshot],
  );

  if (!inspectorOpen || !node) return null;

  const attachedLinks =
    neighborhood?.links.filter(
      (item) => !item.deletedAt && (item.source === node.id || item.target === node.id),
    ) ?? [];

  return (
    <aside className="inspector" aria-label="Graph node details">
      <div className="inspector__header">
        <div>
          <div className="eyebrow">Node details</div>
          <span className="inspector__id">{node.id}</span>
        </div>
        <IconButton label="Close inspector" onClick={() => setInspectorOpen(false)}>
          <X size={17} />
        </IconButton>
      </div>

      <div className="inspector__scroll">
        <section className="inspector__hero">
          <div
            className="inspector__node-mark"
            style={{ "--node-color": nodeStatusColors[node.status] } as React.CSSProperties}
          >
            <CircleDot size={19} />
          </div>
          <div className="inspector__badges">
            <Badge tone="accent">{nodeTypeLabels[node.type]}</Badge>
            <Badge tone={statusTone[node.status]}>{statusLabel[node.status]}</Badge>
          </div>
          <h2>{node.label}</h2>
          <p>{node.description}</p>
        </section>

        <section className="inspector__section">
          <div className="section-label">Record metadata</div>
          <div className="integrity-grid">
            <div>
              <span>Authority level</span>
              <strong>{node.authority.replaceAll("-", " ")}</strong>
            </div>
            <div>
              <span>Confidence score</span>
              <strong>{Math.round(node.confidence * 100)}%</strong>
            </div>
            <div>
              <span>Sources</span>
              <strong>{node.sources.length}</strong>
            </div>
            <div>
              <span>Links</span>
              <strong>{attachedLinks.length}</strong>
            </div>
          </div>
          <div className="confidence-track">
            <span style={{ width: `${node.confidence * 100}%` }} />
          </div>
        </section>

        {node.tags.length > 0 && (
          <section className="inspector__section">
            <div className="section-label">Tags</div>
            <div className="tag-list">
              {node.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="inspector__section">
          <div className="section-label">Linked nodes</div>

          <div className="relationship-list">
            {attachedLinks.slice(0, 8).map((relationship) => {
              const neighborId =
                relationship.source === node.id ? relationship.target : relationship.source;
              const neighbor = snapshot.nodes.find((item) => item.id === neighborId);
              if (!neighbor) return null;
              return (
                <button
                  className="relationship-row"
                  key={relationship.id}
                  onClick={() => selectNode(neighbor.id)}
                >
                  <GitBranch size={14} />
                  <span>
                    <small>{relationship.type.replaceAll("_", " ")}</small>
                    <strong>{neighbor.label}</strong>
                  </span>
                  <ChevronRight size={14} />
                </button>
              );
            })}
            {!attachedLinks.length && <div className="empty-inline">No links connect to this node.</div>}
          </div>
        </section>

        <section className="inspector__section">
          <div className="section-label">Source references</div>
          <div className="source-list">
            {node.sources.map((item) => (
              <div className="source-card" key={`${item.sourceId}-${item.path}`}>
                <FileText size={16} />
                <div>
                  <strong>{item.locator ?? item.sourceId}</strong>
                  <span>{item.path}</span>
                </div>
                <ArrowUpRight size={14} />
              </div>
            ))}
            {!node.sources.length && (
              <div className="source-empty">
                <ShieldCheck size={17} />
                <span>No source reference is attached.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="inspector__footer inspector__footer--readonly">
        <ShieldCheck size={14} />
        Read only · Graph changes require agent access
      </div>
    </aside>
  );
}
