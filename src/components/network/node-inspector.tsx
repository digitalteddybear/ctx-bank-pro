"use client";

import { LeadCrmContext } from "./lead-crm-context";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  GitBranch,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { getNeighborhood } from "@/lib/graph/engine";
import { nodeTypeLabels } from "@/lib/graph/palette";
import { parseLeadDossier } from "@/lib/graph/lead-dossier";
import { useGraphStore } from "@/lib/graph/store";
import type { KnowledgeNode } from "@/lib/graph/types";
import { Badge, Button, IconButton } from "@/components/ui/primitives";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Markdown } from "@astryxdesign/core/Markdown";
import { TextInput } from "@astryxdesign/core/TextInput";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { requestBackendSync } from "@/lib/backend-sync";

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

function ProspectDossier({ node }: { node: KnowledgeNode }) {
  const source = node.sources[0];
  const dossier = parseLeadDossier(source?.excerpt ?? "", source?.path ?? "");

  return (
    <>
      <section className="inspector__hero prospect-hero" id="prospect-description">
        <h2>{node.label}</h2>
        <p>{node.description}</p>
      </section>

      <section className="prospect-validation" id="prospect-validation">
        <div className="section-label">Validation summary</div>
        <p>{dossier.validationSummary}</p>
        <dl className="prospect-highlights">
          {dossier.highlights.map((item) => (
            <div className="prospect-highlight" key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <LeadCrmContext key={node.id} id={node.id.replace(/^lead-/, "")} />

      {dossier.sections.map((section) => (
        <section className="inspector__section prospect-section" key={section.title}>
          <h3>{section.title}</h3>
          <dl className="prospect-rows">
            {section.fields.map((item) => (
              <div className="prospect-row" key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  {item.href ? <a href={item.href} rel="noreferrer" target="_blank">{item.value}</a> : item.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}

export function NodeInspector() {
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const inspectorOpen = useGraphStore((state) => state.inspectorOpen);
  const setInspectorOpen = useGraphStore((state) => state.setInspectorOpen);
  const selectNode = useGraphStore((state) => state.selectNode);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [writeToken, setWriteToken] = useState("");
  const [tagText, setTagText] = useState<string | null>(null);
  const [tagError, setTagError] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  useEffect(() => { setTagText(null); setTagError(""); }, [selectedNodeId]);
  const node = snapshot.nodes.find((item) => item.id === selectedNodeId);
  const isProspect = Boolean(node?.id.startsWith("lead-"));
  const neighborhood = useMemo(
    () => (selectedNodeId ? getNeighborhood(snapshot, selectedNodeId, 1) : null),
    [selectedNodeId, snapshot],
  );
  const inspectorScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inspectorScrollRef.current?.scrollTo({ top: 0 });
    setDeleteDialogOpen(false);
    setDeleteConfirmation("");
    setDeleteError(null);
  }, [selectedNodeId]);

  if (!inspectorOpen || !node) return null;

  const attachedLinks =
    neighborhood?.links.filter(
      (item) => !item.deletedAt && (item.source === node.id || item.target === node.id),
    ) ?? [];

  const closeDeleteDialog = (force = false) => {
    if (isDeleting && !force) return;
    setDeleteDialogOpen(false);
    setDeleteConfirmation("");
    setDeleteError(null);
  };

  const deleteNode = async () => {
    if (deleteConfirmation.trim().toLowerCase() !== "delete") return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/graph/${encodeURIComponent(node.id)}`, {
        method: "DELETE",
        headers: { "x-agent-token": writeToken },
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "The node could not be deleted.");
      }

      requestBackendSync();

      closeDeleteDialog(true);
      selectNode(null);
      setInspectorOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "The node could not be deleted.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <aside className="inspector" aria-label={isProspect ? "Prospect details" : "Graph node details"}>
      <div className="inspector__header">
        <div>
          <div className="eyebrow">{isProspect ? "Prospect details" : "Node details"}</div>
          {!isProspect && <span className="inspector__id">{node.id}</span>}
        </div>
        <IconButton label="Close inspector" onClick={() => setInspectorOpen(false)}>
          <X size={17} />
        </IconButton>
      </div>

      <div className="inspector__scroll" ref={inspectorScrollRef}>
        {isProspect ? <ProspectDossier node={node} /> : <>
        <section className="inspector__hero" id="node-summary">
          <div className="inspector__badges">
            <Badge tone="accent">{nodeTypeLabels[node.type]}</Badge>
            <Badge tone={statusTone[node.status]}>{statusLabel[node.status]}</Badge>
          </div>
          <h2>{node.label}</h2>
          <Markdown contentWidth="100%" density="compact" headingLevelStart={3}>
            {node.description}
          </Markdown>
        </section>

        <section className="inspector__section" id="node-metadata">
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

        <VStack as="section" className="inspector__section" id="node-tags" gap={2}>
          <TextInput label="Graph write token" type="password" value={writeToken} onChange={setWriteToken} description="Use the configured graph operator token to edit or delete records." />
          <TextInput label="Tags" value={tagText ?? node.tags.join(", ")} onChange={setTagText} description="Separate tags with commas." />
          {tagError && <Text role="alert">{tagError}</Text>}
          <HStack><Button loading={savingTags} onClick={async () => {
            setSavingTags(true); setTagError("");
            try {
              const tags = [...new Set((tagText ?? node.tags.join(",")).split(",").map(tag => tag.trim()).filter(Boolean))];
              const response = await fetch(`/api/graph/${encodeURIComponent(node.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-agent-token": writeToken }, body: JSON.stringify({ tags }) });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error ?? "Unable to save tags");
              setTagText(null); requestBackendSync();
            } catch (error) { setTagError((error as Error).message); }
            finally { setSavingTags(false); }
          }}>Save tags</Button></HStack>
        </VStack>

        <section className="inspector__section" id="node-relationships">
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

        <section className="inspector__section" id="node-sources">
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
        </>}
      </div>

      <div className="inspector__footer inspector__footer--actions">
        <Button
          className="inspector__delete-button"
          onClick={() => setDeleteDialogOpen(true)}
          size="sm"
          variant="danger"
        >
          <Trash2 size={14} />
          {isProspect ? "Remove prospect" : "Delete node"}
        </Button>
      </div>

      <Dialog
        isOpen={deleteDialogOpen}
        onOpenChange={(isOpen) => (isOpen ? setDeleteDialogOpen(true) : closeDeleteDialog())}
        purpose="form"
        width={400}
      >
        <DialogHeader
          onOpenChange={(isOpen) => (isOpen ? setDeleteDialogOpen(true) : closeDeleteDialog())}
          startContent={<Trash2 size={18} />}
          subtitle={isProspect ? "This removes the prospect from the active graph while retaining a recoverable record." : "This soft-deletes the node and its attached relationships."}
          title={isProspect ? "Remove prospect" : "Delete node"}
        />
        <form
          className="node-delete-confirmation"
          onSubmit={(event) => {
            event.preventDefault();
            void deleteNode();
          }}
        >
          <TextInput
            hasAutoFocus
            isRequired
            label='Type "delete" to confirm'
            onChange={(value) => {
              setDeleteConfirmation(value);
              setDeleteError(null);
            }}
            placeholder="delete"
            status={deleteError ? { type: "error", message: deleteError } : undefined}
            value={deleteConfirmation}
          />
          <div className="node-delete-confirmation__actions">
            <Button onClick={() => closeDeleteDialog()} size="sm" type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={deleteConfirmation.trim().toLowerCase() !== "delete"}
              loading={isDeleting}
              size="sm"
              type="submit"
              variant="danger"
            >
              <Trash2 size={14} />
              {isProspect ? "Remove prospect" : "Delete node"}
            </Button>
          </div>
        </form>
      </Dialog>
    </aside>
  );
}
