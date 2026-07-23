"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useGraphStore } from "@/lib/graph/store";
import {
  AUTHORITY_LEVELS,
  NODE_STATUSES,
  NODE_TYPES,
  type AuthorityLevel,
  type NodeStatus,
  type NodeType,
} from "@/lib/graph/types";
import { Button, IconButton } from "@/components/ui/primitives";

export function NodeEditor() {
  const open = useGraphStore((state) => state.editorOpen);
  const mode = useGraphStore((state) => state.editorMode);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const snapshot = useGraphStore((state) => state.snapshot);
  const current = snapshot.nodes.find((node) => node.id === selectedNodeId);

  if (!open) return null;

  return (
    <NodeEditorForm
      key={`${mode}-${current?.id ?? "new"}`}
      mode={mode}
      current={current}
    />
  );
}

function NodeEditorForm({
  mode,
  current,
}: {
  mode: "create" | "edit";
  current: ReturnType<typeof useGraphStore.getState>["snapshot"]["nodes"][number] | undefined;
}) {
  const setOpen = useGraphStore((state) => state.setEditorOpen);
  const addNode = useGraphStore((state) => state.addNode);
  const updateNode = useGraphStore((state) => state.updateNode);

  const [label, setLabel] = useState(mode === "edit" ? current?.label ?? "" : "");
  const [description, setDescription] = useState(
    mode === "edit" ? current?.description ?? "" : "",
  );
  const [type, setType] = useState<NodeType>(
    mode === "edit" ? current?.type ?? "concept" : "concept",
  );
  const [status, setStatus] = useState<NodeStatus>(
    mode === "edit" ? current?.status ?? "review" : "review",
  );
  const [authority, setAuthority] = useState<AuthorityLevel>(
    mode === "edit" ? current?.authority ?? "agent-generated" : "agent-generated",
  );
  const [confidence, setConfidence] = useState(
    mode === "edit" ? Math.round((current?.confidence ?? 0.7) * 100) : 70,
  );
  const [tags, setTags] = useState(mode === "edit" ? current?.tags.join(", ") ?? "" : "");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      label,
      description,
      type,
      status,
      authority,
      confidence: confidence / 100,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    if (mode === "edit" && current) updateNode(current.id, payload);
    else addNode(payload);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <form
        className="modal node-editor"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <div className="eyebrow">{mode === "edit" ? "Edit knowledge" : "Create knowledge"}</div>
            <h2>{mode === "edit" ? "Refine node" : "Add to the network"}</h2>
          </div>
          <IconButton label="Close editor" onClick={() => setOpen(false)}>
            <X size={17} />
          </IconButton>
        </div>

        <div className="form-grid">
          <label className="field field--wide">
            <span>Node name</span>
            <input
              autoFocus
              required
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Narrative Alignment Protocol"
            />
          </label>
          <label className="field field--wide">
            <span>Description</span>
            <textarea
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Write a precise, operational definition."
              rows={4}
            />
          </label>
          <label className="field">
            <span>Knowledge type</span>
            <select value={type} onChange={(event) => setType(event.target.value as NodeType)}>
              {NODE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as NodeStatus)}>
              {NODE_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Authority</span>
            <select
              value={authority}
              onChange={(event) => setAuthority(event.target.value as AuthorityLevel)}
            >
              {AUTHORITY_LEVELS.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Confidence · {confidence}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={confidence}
              onChange={(event) => setConfidence(Number(event.target.value))}
            />
          </label>
          <label className="field field--wide">
            <span>Topics</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="strategy, narrative, delivery"
            />
            <small>Separate topics with commas.</small>
          </label>
        </div>

        <div className="modal__footer">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!label.trim() || !description.trim()}>
            <Plus size={15} />
            {mode === "edit" ? "Save changes" : "Create node"}
          </Button>
        </div>
      </form>
    </div>
  );
}
