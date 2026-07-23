"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDot,
  FileText,
  GitBranch,
  Link2,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { getNeighborhood } from "@/lib/graph/engine";
import { nodeStatusColors, nodeTypeLabels } from "@/lib/graph/palette";
import { useGraphStore } from "@/lib/graph/store";
import { EDGE_TYPES, type EdgeType } from "@/lib/graph/types";
import { Badge, Button, IconButton } from "@/components/ui/primitives";

const statusTone = {
  verified: "success",
  hypothesis: "warning",
  review: "cyan",
  conflicted: "danger",
  deprecated: "neutral",
} as const;

export function NodeInspector() {
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const inspectorOpen = useGraphStore((state) => state.inspectorOpen);
  const setInspectorOpen = useGraphStore((state) => state.setInspectorOpen);
  const selectNode = useGraphStore((state) => state.selectNode);
  const openEditNode = useGraphStore((state) => state.openEditNode);
  const deprecateNode = useGraphStore((state) => state.deprecateNode);
  const removeNode = useGraphStore((state) => state.removeNode);
  const restoreNode = useGraphStore((state) => state.restoreNode);
  const addLink = useGraphStore((state) => state.addLink);

  const [linking, setLinking] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [linkType, setLinkType] = useState<EdgeType>("related_to");

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

  const commitLink = () => {
    if (!targetId) return;
    const result = addLink({ source: node.id, target: targetId, type: linkType });
    if (result) {
      setLinking(false);
      setTargetId("");
    }
  };

  return (
    <aside className="inspector" aria-label="Knowledge node details">
      <div className="inspector__header">
        <div>
          <div className="eyebrow">Node inspector</div>
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
            <Badge tone="violet">{nodeTypeLabels[node.type]}</Badge>
            <Badge tone={statusTone[node.status]}>{node.status}</Badge>
          </div>
          <h2>{node.label}</h2>
          <p>{node.description}</p>
        </section>

        <section className="inspector__section">
          <div className="section-label">Knowledge integrity</div>
          <div className="integrity-grid">
            <div>
              <span>Authority</span>
              <strong>{node.authority.replaceAll("-", " ")}</strong>
            </div>
            <div>
              <span>Confidence</span>
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
            <div className="section-label">Topics</div>
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
          <div className="section-heading">
            <div className="section-label">Relationships</div>
            <button className="text-action" onClick={() => setLinking((value) => !value)}>
              <Link2 size={13} />
              Connect
            </button>
          </div>

          {linking && (
            <div className="inline-form">
              <label>
                Relationship
                <select value={linkType} onChange={(event) => setLinkType(event.target.value as EdgeType)}>
                  {EDGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Target node
                <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                  <option value="">Select a node</option>
                  {snapshot.nodes
                    .filter((item) => item.id !== node.id && !item.deletedAt)
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </label>
              <div className="inline-form__actions">
                <Button variant="ghost" size="sm" onClick={() => setLinking(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={commitLink} disabled={!targetId}>
                  <Check size={14} />
                  Add link
                </Button>
              </div>
            </div>
          )}

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
            {!attachedLinks.length && <div className="empty-inline">No active relationships.</div>}
          </div>
        </section>

        <section className="inspector__section">
          <div className="section-label">Source provenance</div>
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
                <span>Awaiting an attached source.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="inspector__footer">
        {node.deletedAt ? (
          <Button variant="secondary" onClick={() => restoreNode(node.id)}>
            <RotateCcw size={15} />
            Restore
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => openEditNode(node.id)}>
              <Pencil size={15} />
              Edit
            </Button>
            <Button variant="ghost" onClick={() => deprecateNode(node.id)}>
              Deprecate
            </Button>
            <IconButton
              label="Remove node"
              className="icon-button--danger"
              onClick={() => {
                if (window.confirm(`Remove “${node.label}”? This can be undone.`)) removeNode(node.id);
              }}
            >
              <Trash2 size={16} />
            </IconButton>
          </>
        )}
      </div>
    </aside>
  );
}
