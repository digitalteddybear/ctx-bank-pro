"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import {
  Table,
  proportional,
  useTableTreeState,
  useTableTreeData,
  useTableSortableState,
  useTableSortable,
  useTableColumnResize,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Markdown } from "@astryxdesign/core/Markdown";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  FileText,
  Folder,
  RefreshCw,
  Save,
  Download,
  Code,
  Maximize2,
  GitFork,
  ChevronDown,
  Search,
} from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import {
  filterArchitecture,
  flattenArchitecture,
  type ArchitectureNode,
  type ArchitectureFile,
  type ArchitectureDraft,
} from "@/lib/architecture/types";
import { treeKeyboard } from "./tree-keyboard";
import { ArchitectureIdeOverlay } from "./architecture-ide-overlay";
import { requestBackendSync } from "@/lib/backend-sync";

type Scratch = { content: string; baseHash: string; revision: string | null };
const scratchKey = (id: string) => `ctxbankpro:architecture-draft:${id}`;
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unavailable";

const summaries: Record<string, string> = {
  agents:
    "Agent profiles define responsibilities. The engine moves runs through research, drafting, conversation and compliance. The orchestrator coordinates events, while training and transport modules provide supporting services.",
  rag:
    "The pipeline normalizes, structures and publishes versioned context. The retrieval agent queries that context. The corpus loader and MCP servers connect the knowledge base to CTX and its tools.",
};

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "recently";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (isNaN(diffSec) || diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
  if (diffSec < 172800) return "yesterday";
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)} days ago`;
  if (diffSec < 31536000) return `${Math.floor(diffSec / 2592000)} months ago`;
  return `${Math.floor(diffSec / 31536000)} years ago`;
}

export function ArchitectureView() {
  const [nodes, setNodes] = useState<ArchitectureNode[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("all");
  const [selectedId, setSelectedId] = useState("agents");
  const [cursor, setCursor] = useState("agents");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    new Set(["agents", "rag", "agents/runtime"]),
  );
  const [activeDocTab, setActiveDocTab] = useState("readme");
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [file, setFile] = useState<ArchitectureFile | null>(null);
  const [scratch, setScratch] = useState<Scratch | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [mode, setMode] = useState("preview");
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reload, setReload] = useState(0);

  // IDE Bottom Drawer and Tabs

  // IDE Full-Screen Overlay state
  const [isIdeOverlayOpen, setIsIdeOverlayOpen] = useState(false);

  const combinedNodes = nodes;

  const all = useMemo(() => flattenArchitecture(combinedNodes), [combinedNodes]);
  const selected = all.find((node) => node.id === selectedId);
  const content = scratch?.content ?? file?.draft?.content ?? file?.content ?? "";
  const dirty = !!file && content !== (file.draft?.content ?? file.content);
  const conflict = !!file && (scratch?.baseHash ?? file.draft?.baseHash ?? file.hash) !== file.hash;

  const request = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        ...options,
        cache: "no-store",
        headers: {
          ...options.headers,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) setAuthRequired(true);
      if (!response.ok) throw new Error(data.error ?? "Request failed. Retry shortly.");
      return data;
    },
    [accessToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    request("/api/architecture", { signal: controller.signal })
      .then((data) => {
        setNodes(data.nodes);
        setWarnings(data.warnings);
        setAuthRequired(false);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request, reload]);

  useEffect(() => {
    if (selected?.kind !== "file") return;
    const controller = new AbortController();
    request(`/api/architecture?file=${encodeURIComponent(selected.id)}`, {
      signal: controller.signal,
    })
      .then((data: ArchitectureFile) => {
        setFile(data);
        try {
          const stored = sessionStorage.getItem(scratchKey(data.id));
          setScratch(stored ? JSON.parse(stored) : null);
        } catch {
          setMessage("Browser recovery is unavailable. Save your draft before leaving this file.");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setFileLoading(false);
      });
    return () => controller.abort();
  }, [selected, request, reload]);

  const select = useCallback(
    (node: ArchitectureNode) => {
      if (saving) return;
      setSelectedId(node.id);
      setFile(null);
      setScratch(null);
      setError("");
      setMessage("");
      setMode("preview");
      setFileLoading(node.kind === "file");
    },
    [saving],
  );

  const filtered = useMemo(() => {
    const list = combinedNodes.filter((n) => {
      if (area === "all") return true;
      return n.area === area;
    });
    return filterArchitecture(list, query);
  }, [combinedNodes, area, query]);

  const searchExpanded = useMemo(
    () => new Set(flattenArchitecture(filtered).filter((n) => n.children?.length).map((n) => n.id)),
    [filtered],
  );
  const sortable = useTableSortableState<ArchitectureNode>({
    data: filtered,
    defaultSort: [{ sortKey: "name", direction: "ascending" }],
    comparators: {
      name: (a, b) => {
        if (a.id === "agents") return -1;
        if (b.id === "agents") return 1;
        if (a.id === "rag" && b.id !== "agents") return -1;
        if (b.id === "rag" && a.id !== "agents") return 1;
        return a.name.localeCompare(b.name);
      },
      fileCount: (a, b) => a.fileCount - b.fileCount,
      commit: (a, b) => (a.commit?.date ?? "").localeCompare(b.commit?.date ?? ""),
    },
  });
  const treeState = useTableTreeState({
    data: filtered,
    idKey: "id",
    expandedIds: query.trim() ? searchExpanded : expanded,
    onExpandedIdsChange: (ids) => {
      if (!query.trim()) setExpanded(ids);
    },
    sortSiblings: sortable.applySort,
  });
  const tree = useTableTreeData(treeState.treeConfig);
  const sort = useTableSortable<ArchitectureNode>(sortable.sortConfig);
  const columns = useMemo<TableColumn<ArchitectureNode>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        width: proportional(3),
        sortable: true,
        renderCell: (node) => (
          <HStack gap={2} vAlign="center">
            {node.kind === "folder" ? (
              <Folder size={15} style={{ color: "var(--foreground-muted, #9ca3af)", flexShrink: 0 }} aria-hidden="true" />
            ) : (
              <FileText size={15} style={{ color: "var(--foreground-muted, #9ca3af)", flexShrink: 0 }} aria-hidden="true" />
            )}
            <Text maxLines={1} style={{ fontWeight: node.kind === "folder" ? 500 : 400 }}>
              {node.name}
            </Text>
          </HStack>
        ),
      },
      {
        key: "commit",
        header: "Last commit message",
        width: proportional(5),
        sortable: true,
        renderCell: (node) => (
          <Text maxLines={1} color="secondary" style={{ fontSize: "13px" }}>
            {node.commit?.subject ?? "No commit history available"}
          </Text>
        ),
      },
      {
        key: "date",
        header: "Last commit date",
        width: proportional(2),
        sortable: true,
        renderCell: (node) => (
          <Text maxLines={1} color="secondary" style={{ fontSize: "13px", textAlign: "right" }}>
            {formatRelativeTime(node.commit?.date || node.modified)}
          </Text>
        ),
      },
    ],
    [],
  );
  const resize = useTableColumnResize<ArchitectureNode>({
    columns: columns.map(({ key, width }) => ({ key, width })),
    columnWidths: widths,
    onColumnResizeEnd: (update) => setWidths((previous) => ({ ...previous, ...update })),
  });
  const keyboard = treeKeyboard(
    treeState.visibleData,
    selectedId,
    cursor,
    setCursor,
    select,
    treeState.expandedIds,
    treeState.treeConfig.onToggleItem,
  );

  function edit(value: string) {
    if (!file) return;
    const next: Scratch = {
      content: value,
      baseHash: scratch?.baseHash ?? file.draft?.baseHash ?? file.hash,
      revision: scratch?.revision ?? file.draft?.revision ?? null,
    };
    setScratch(next);
    setMessage("");
    try {
      sessionStorage.setItem(scratchKey(file.id), JSON.stringify(next));
    } catch {
      setMessage("Browser recovery is unavailable. Save your draft before leaving this file.");
    }
  }

  async function save() {
    if (!file || saving) return;
    const id = file.id;
    setSaving(true);
    setError("");
    try {
      const draft: ArchitectureDraft = await request("/api/architecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          content,
          baseHash: scratch?.baseHash ?? file.draft?.baseHash ?? file.hash,
          revision: scratch?.revision ?? file.draft?.revision ?? null,
        }),
      });
      setFile((current) => (current?.id === id ? { ...current, draft } : current));
      setScratch(null);
      sessionStorage.removeItem(scratchKey(id));
      setMessage("Draft saved. Source and running behaviour are unchanged.");
      requestBackendSync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function download() {
    if (!file) return;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `draft-${file.path.split("/").pop()}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (isIdeOverlayOpen) e.preventDefault();
        if (isIdeOverlayOpen && file && dirty && !saving && !conflict) {
          e.preventDefault();
          save();
        }
      }
      if (e.key === "Escape" && isIdeOverlayOpen && !discardOpen) {
        setIsIdeOverlayOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isIdeOverlayOpen, file, dirty, saving, discardOpen, save]);

  const crumbs = selected
    ? all.filter((n) => n.id === selected.id || selected.id.startsWith(`${n.id}/`))
    : [];

  const detail = (
    <div
      className="architecture-detail"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        marginTop: "16px",
      }}
      aria-busy={fileLoading}
    >
      {/* Top Document Tab Bar: Readme, Code of conduct, MIT license, Security */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "2px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {[
            { id: "agents/guide", label: "Agent guide" },
            { id: "rag/readme", label: "RAG README" },
          ].map((tab) => {
            const isActive = activeDocTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveDocTab(tab.id);
                  const document = all.find(node => node.id === tab.id);
                  if (document) select(document);
                }}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? "2px solid var(--foreground, #ffffff)" : "2px solid transparent",
                  padding: "8px 2px",
                  fontSize: "14px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  marginBottom: "-1px",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {file && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }} className="architecture-controls">
            <SegmentedControl size="sm" label="File display" value={mode} onChange={setMode}>
              <SegmentedControlItem value="preview" label="Preview" />
              <SegmentedControlItem value="edit" label="Edit draft" />
            </SegmentedControl>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setIsIdeOverlayOpen(true);
              }}
            >
              <Code size={13} /> Open in IDE Overlay
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || conflict || saving} loading={saving}>
              <Save size={13} /> Save draft
            </Button>
            <Button size="sm" variant="secondary" onClick={download}>
              <Download size={13} /> Export
            </Button>
          </div>
        )}
      </div>

      {/* Document Body Card */}
      <div
        style={{
          borderRadius: "8px",
          border: "1px solid var(--border)",
          padding: "28px 32px",
          background: "var(--card)",
          minHeight: "220px",
        }}
      >
        {fileLoading && <Text role="status">Loading file…</Text>}

        {file ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--border)",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FileText size={16} style={{ color: "var(--foreground-muted)" }} />
                <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--foreground)" }}>
                  {file.path}
                </span>
                <Badge tone={dirty ? "warning" : file.draft ? "success" : "neutral"}>
                  {dirty ? "Unsaved draft" : file.draft ? "Draft saved" : "Source"}
                </Badge>
              </div>
              <Text role="status" type="supporting" color="secondary">
                {dirty
                  ? "Unsaved edits · recovered in this browser tab"
                  : file.draft
                  ? `Draft saved ${date(file.draft.savedAt)}`
                  : "Source file · edit to create a draft"}
              </Text>
            </div>

            {conflict && (
              <Text role="alert" style={{ marginBottom: "12px", color: "var(--warning)" }}>
                The source changed since this draft began. Export your edits, then start from the latest
                source to merge them.
              </Text>
            )}

            {mode === "edit" ? (
              <TextArea
                label="Draft content"
                value={content}
                onChange={edit}
                rows={22}
                hasSpellCheck={false}
                isDisabled={saving}
              />
            ) : file.path.endsWith(".md") ? (
              <Markdown
                headingLevelStart={3}
                contentWidth="100%"
                onLinkClick={(href) => {
                  if (/^https?:\/\//.test(href) || href.startsWith("#")) return;
                  const resolved = new URL(href, `https://architecture.local/${file.path}`).pathname.slice(1);
                  const node = all.find((n) => n.path === resolved);
                  if (node) select(node);
                  return false;
                }}
              >
                {content}
              </Markdown>
            ) : (
              <CodeBlock
                code={content}
                language={file.path.endsWith(".py") ? "python" : file.path.endsWith(".json") ? "json" : "typescript"}
                width="100%"
                maxHeight="var(--architecture-code-height)"
                hasLineNumbers
                container="section"
              />
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "14px",
                marginTop: "14px",
                borderTop: "1px solid var(--border)",
                flexWrap: "wrap",
                gap: "8px",
              }}
              className="architecture-controls"
            >
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDiscardOpen(true)}>
                Start from source
              </Button>
              <Text type="supporting" color="secondary">
                Drafts are stored for review. Applying them to the backend is a separate step.
              </Text>
            </div>
          </>
        ) : (
          <VStack gap={3}>
            <Heading level={2}>{selected?.name ?? "Repository overview"}</Heading>
            <Text>{summaries[selected?.area ?? "agents"]}</Text>
            <Text>{selected?.fileCount ?? all.filter(node => node.kind === "file").length} source files</Text>
            <Button size="sm" variant="secondary" onClick={() => { const guide = all.find(node => node.id === (selected?.area === "rag" ? "rag/readme" : "agents/guide")); if (guide) select(guide); }}>Read architecture guide</Button>
          </VStack>
        )}
      </div>
    </div>
  );

  return (
    <VStack as="main" className="workspace architecture-view" gap={4}>
      {/* Top Bar: Title canvas-editor with Public badge and Star, Watch, Fork actions */}
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <HStack gap={2} vAlign="center">
          <Heading level={1} style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
            Architecture
          </Heading>
          <span style={{ color: "var(--foreground-muted)", fontSize: "16px" }}>/</span>
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--foreground)" }}>CTX BankPro</span>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--foreground-muted)",
              padding: "2px 8px",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "rgba(255, 255, 255, 0.04)",
            }}
          >
            Local checkout
          </span>
        </HStack>

        <HStack gap={2} vAlign="center" wrap="wrap">
          <Badge>{nodes.reduce((sum, node) => sum + node.fileCount, 0)} source files</Badge>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setIsIdeOverlayOpen(true);
            }}
            style={{ marginLeft: "4px" }}
          >
            <Maximize2 size={13} /> Full IDE
          </Button>

          <Button
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setLoading(true);
              setReload((n) => n + 1);
            }}
          >
            <RefreshCw size={13} /> Refresh
          </Button>
        </HStack>
      </HStack>

      {authRequired && (
        <HStack gap={2} wrap="wrap" className="architecture-controls">
          <TextInput label="Operator token" type="password" value={token} onChange={setToken} />
          <Button
            size="sm"
            onClick={() => {
              setAccessToken(token);
              setToken("");
            }}
          >
            Connect
          </Button>
        </HStack>
      )}
      {error && <Text role="alert">{error}</Text>}
      {message && <Text role="status">{message}</Text>}
      {warnings.map((warning) => (
        <Text key={warning} role="status" color="secondary">
          {warning}
        </Text>
      ))}

      {/* Sub-header Bar: Branch dropdown, counts, Area toggle, Search, Add file, Code CTA */}
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <button
            type="button"
            disabled
            className="github-branch-btn"
          >
            <GitFork size={14} />
            <span>Working copy</span>
            <ChevronDown size={13} style={{ opacity: 0.7 }} />
          </button>

          <span style={{ fontSize: "13px", color: "var(--foreground-muted)", display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <strong style={{ color: "var(--foreground)", fontWeight: 600 }}>{nodes.length}</strong> Areas
          </span>
          <span style={{ fontSize: "13px", color: "var(--foreground-muted)", display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <strong style={{ color: "var(--foreground)", fontWeight: 600 }}>{all.filter(node => node.kind === "file").length}</strong> Files
          </span>

          <div className="architecture-controls">
            <SegmentedControl label="Architecture area" value={area} onChange={setArea}>
              <SegmentedControlItem value="all" label="All" />
              <SegmentedControlItem value="agents" label="Agents" />
              <SegmentedControlItem value="rag" label="RAG" />
            </SegmentedControl>
          </div>
        </HStack>

        <HStack gap={2} vAlign="center" wrap="wrap">
          <div style={{ width: "220px" }} className="architecture-controls">
            <TextInput
              label="Search architecture"
              isLabelHidden
              placeholder="Go to file"
              value={query}
              onChange={setQuery}
              hasClear
              startIcon={<Search size={14} style={{ color: "var(--foreground-muted)" }} />}
            />
          </div>

          <button
            type="button"
            className="github-action-btn"
          >
            <span>Add file</span>
            <ChevronDown size={13} style={{ opacity: 0.7 }} />
          </button>

          <button
            type="button"
            onClick={() => {
              setIsIdeOverlayOpen(true);
            }}
            className="github-code-cta"
          >
            <Code size={15} />
            <span>Code</span>
          </button>
        </HStack>
      </HStack>

      {/* Breadcrumb row: only render when inside a nested directory/file */}
      {crumbs.length > 1 && (
        <HStack
          gap={1}
          vAlign="center"
          wrap="wrap"
          aria-label="Selected path"
          className="architecture-breadcrumbs architecture-controls"
          style={{ fontSize: "14px", color: "var(--foreground-muted)" }}
        >
          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>CTX BankPro</span>
          {crumbs.map((node) => (
            <span key={node.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "var(--foreground-muted)", margin: "0 2px" }}>/</span>
              <Button key={node.id} variant="ghost" size="sm" disabled={saving} onClick={() => select(node)}>
                {node.name}
              </Button>
            </span>
          ))}
        </HStack>
      )}

      {/* Main 2-Column Split matching Screenshot 2026-10-31 at 19.15.45.png */}
      <div className="architecture-layout" style={{ display: "flex", gap: "24px", alignItems: "flex-start", width: "100%" }}>
        {/* Left Column: ~75% width */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* 1. Tree Table Card */}
          <div className="astryx-layout-content" style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)", overflow: "hidden", background: "var(--card)" }}>
            {loading ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--foreground-muted)" }}>
                Loading architecture…
              </div>
            ) : filtered.length ? (
              <Table
                aria-label="Architecture files"
                data={treeState.visibleData}
                columns={columns}
                idKey="id"
                hasHover
                textOverflow="truncate"
                plugins={{ tree, sort, resize, keyboard }}
              />
            ) : (
              <EmptyState
                title="No matching components"
                description="Try another file name or architecture area."
              />
            )}
            <VStack padding={3} gap={1} style={{ borderTop: "1px solid var(--border)", background: "rgba(0, 0, 0, 0.05)" }}>
              <Text type="supporting" color="secondary">
                Arrow keys explore folders. Enter opens details. Drag column edges to resize.
              </Text>
              <Text type="supporting" color="secondary">
                {filtered.reduce((sum, n) => sum + n.fileCount, 0)} files in this view
              </Text>
            </VStack>
          </div>

          {/* 2. Tabbed Document Panel below the tree table */}
          {detail}
        </div>

        {/* Right Column: "About" Sidebar matching Screenshot */}
        <div className="astryx-layout-panel" style={{ width: "300px", flexShrink: 0 }}>
          <div
            className="architecture-about-sidebar"
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              paddingLeft: "8px",
            }}
          >
            <VStack gap={3}>
              <Heading level={3}>About this architecture</Heading>
              <Text>{summaries[selected?.area ?? "agents"]}</Text>
              {nodes.map(node => <VStack key={node.id} gap={1}><Text weight="semibold">{node.name}</Text><Text>{node.fileCount} files</Text><Text type="supporting" color="secondary">{node.commit?.subject ?? "No commit history available"}</Text></VStack>)}
            </VStack>
          </div>
        </div>
      </div>

      <Dialog isOpen={discardOpen} onOpenChange={setDiscardOpen} purpose="form">
        <DialogHeader title="Start from current source?" onOpenChange={setDiscardOpen} />
        <VStack gap={3}>
          <Text>
            This replaces the editor contents. Export your draft first if you want to keep a copy.
            The saved draft changes only when you save again.
          </Text>
          <HStack gap={2} className="architecture-controls">
            <Button variant="secondary" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                if (file) {
                  const next = {
                    content: file.content,
                    baseHash: file.hash,
                    revision: file.draft?.revision ?? null,
                  };
                  setScratch(next);
                  try {
                    sessionStorage.setItem(scratchKey(file.id), JSON.stringify(next));
                  } catch {}
                }
                setDiscardOpen(false);
              }}
            >
              Use current source
            </Button>
          </HStack>
        </VStack>
      </Dialog>

      {/* Full-Screen Built-In IDE Overlay matching Astryx CLI Template */}
      <ArchitectureIdeOverlay
        isOpen={isIdeOverlayOpen}
        onClose={() => setIsIdeOverlayOpen(false)}
        activeFileNode={file}
        nodes={nodes}
        onSelect={select}
        content={content}
        onEdit={edit}
        onSave={save}
        saving={saving}
        canSave={dirty && !conflict}
        feedback={error || message}
      />

    </VStack>
  );
}
