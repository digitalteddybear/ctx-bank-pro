"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialGraph } from "./seed";
import type {
  GraphActivity,
  GraphSnapshot,
  KnowledgeLink,
  KnowledgeNode,
  NewLinkInput,
  NewNodeInput,
  NodePatch,
} from "./types";

type ViewMode = "dashboard" | "network" | "sources";

interface GraphStore {
  snapshot: GraphSnapshot;
  selectedNodeId: string | null;
  viewMode: ViewMode;
  searchQuery: string;
  inspectorOpen: boolean;
  commandOpen: boolean;
  editorOpen: boolean;
  editorMode: "create" | "edit";
  highlightedNodeIds: string[];
  lastMutation: GraphSnapshot | null;
  selectNode: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setInspectorOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  openCreateNode: () => void;
  openEditNode: (id: string) => void;
  setEditorOpen: (open: boolean) => void;
  setHighlightedNodes: (ids: string[]) => void;
  addNode: (input: NewNodeInput) => KnowledgeNode;
  updateNode: (id: string, patch: NodePatch) => void;
  deprecateNode: (id: string) => void;
  removeNode: (id: string) => void;
  restoreNode: (id: string) => void;
  addLink: (input: NewLinkInput) => KnowledgeLink | null;
  removeLink: (id: string) => void;
  undoLastMutation: () => void;
  resetGraph: () => void;
}

const now = () => new Date().toISOString();
const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;

const activity = (
  action: GraphActivity["action"],
  subjectId: string,
  subjectLabel: string,
  detail: string,
): GraphActivity => ({
  id: newId("activity"),
  action,
  subjectId,
  subjectLabel,
  actor: "Knowledge operator",
  timestamp: now(),
  detail,
});

const copySnapshot = (snapshot: GraphSnapshot): GraphSnapshot =>
  typeof structuredClone === "function"
    ? structuredClone(snapshot)
    : JSON.parse(JSON.stringify(snapshot));

export const useGraphStore = create<GraphStore>()(
  persist(
    (set, get) => ({
      snapshot: initialGraph,
      selectedNodeId: null,
      viewMode: "dashboard",
      searchQuery: "",
      inspectorOpen: false,
      commandOpen: false,
      editorOpen: false,
      editorMode: "create",
      highlightedNodeIds: [],
      lastMutation: null,

      selectNode: (id) =>
        set({
          selectedNodeId: id,
          inspectorOpen: Boolean(id),
        }),
      setViewMode: (viewMode) => set({ viewMode }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      openCreateNode: () =>
        set({ editorOpen: true, editorMode: "create", selectedNodeId: null }),
      openEditNode: (selectedNodeId) =>
        set({ editorOpen: true, editorMode: "edit", selectedNodeId }),
      setEditorOpen: (editorOpen) => set({ editorOpen }),
      setHighlightedNodes: (highlightedNodeIds) => set({ highlightedNodeIds }),

      addNode: (input) => {
        const timestamp = now();
        const node: KnowledgeNode = {
          id: newId("node"),
          label: input.label.trim(),
          type: input.type,
          description: input.description.trim(),
          status: input.status ?? "review",
          authority: input.authority ?? "agent-generated",
          confidence: input.confidence ?? 0.7,
          tags: input.tags ?? [],
          sources: input.sources ?? [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const before = copySnapshot(get().snapshot);
        set((state) => ({
          lastMutation: before,
          snapshot: {
            ...state.snapshot,
            generatedAt: timestamp,
            nodes: [...state.snapshot.nodes, node],
            activities: [
              activity("created", node.id, node.label, "Created a new knowledge node."),
              ...state.snapshot.activities,
            ],
          },
          selectedNodeId: node.id,
          inspectorOpen: true,
          editorOpen: false,
        }));
        return node;
      },

      updateNode: (id, patch) => {
        const existing = get().snapshot.nodes.find((item) => item.id === id);
        if (!existing) return;
        const timestamp = now();
        const before = copySnapshot(get().snapshot);
        set((state) => ({
          lastMutation: before,
          snapshot: {
            ...state.snapshot,
            generatedAt: timestamp,
            nodes: state.snapshot.nodes.map((item) =>
              item.id === id ? { ...item, ...patch, updatedAt: timestamp } : item,
            ),
            activities: [
              activity("updated", id, patch.label ?? existing.label, "Updated node metadata."),
              ...state.snapshot.activities,
            ],
          },
          editorOpen: false,
        }));
      },

      deprecateNode: (id) => {
        const existing = get().snapshot.nodes.find((item) => item.id === id);
        if (!existing) return;
        const timestamp = now();
        const before = copySnapshot(get().snapshot);
        set((state) => ({
          lastMutation: before,
          snapshot: {
            ...state.snapshot,
            generatedAt: timestamp,
            nodes: state.snapshot.nodes.map((item) =>
              item.id === id
                ? { ...item, status: "deprecated", updatedAt: timestamp }
                : item,
            ),
            activities: [
              activity("deprecated", id, existing.label, "Marked node as deprecated."),
              ...state.snapshot.activities,
            ],
          },
        }));
      },

      removeNode: (id) => {
        const existing = get().snapshot.nodes.find((item) => item.id === id);
        if (!existing) return;
        const timestamp = now();
        const before = copySnapshot(get().snapshot);
        set((state) => ({
          lastMutation: before,
          snapshot: {
            ...state.snapshot,
            generatedAt: timestamp,
            nodes: state.snapshot.nodes.map((item) =>
              item.id === id ? { ...item, deletedAt: timestamp, updatedAt: timestamp } : item,
            ),
            links: state.snapshot.links.map((item) =>
              item.source === id || item.target === id
                ? { ...item, deletedAt: timestamp, updatedAt: timestamp }
                : item,
            ),
            activities: [
              activity("removed", id, existing.label, "Soft-deleted node and attached relationships."),
              ...state.snapshot.activities,
            ],
          },
          selectedNodeId: null,
          inspectorOpen: false,
        }));
      },

      restoreNode: (id) => {
        const existing = get().snapshot.nodes.find((item) => item.id === id);
        if (!existing) return;
        const timestamp = now();
        const before = copySnapshot(get().snapshot);
        set((state) => ({
          lastMutation: before,
          snapshot: {
            ...state.snapshot,
            generatedAt: timestamp,
            nodes: state.snapshot.nodes.map((item) =>
              item.id === id ? { ...item, deletedAt: undefined, updatedAt: timestamp } : item,
            ),
            activities: [
              activity("restored", id, existing.label, "Restored a previously removed node."),
              ...state.snapshot.activities,
            ],
          },
        }));
      },

      addLink: (input) => {
        if (input.source === input.target) return null;
        const state = get();
        const exists = state.snapshot.links.some(
          (item) =>
            !item.deletedAt &&
            item.source === input.source &&
            item.target === input.target &&
            item.type === input.type,
        );
        if (exists) return null;
        const sourceNode = state.snapshot.nodes.find((item) => item.id === input.source);
        const targetNode = state.snapshot.nodes.find((item) => item.id === input.target);
        if (!sourceNode || !targetNode) return null;
        const timestamp = now();
        const link: KnowledgeLink = {
          id: newId("link"),
          source: input.source,
          target: input.target,
          type: input.type,
          strength: input.strength ?? 0.75,
          verified: input.verified ?? false,
          description: input.description,
          sourceIds: input.sourceIds,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const before = copySnapshot(state.snapshot);
        set((current) => ({
          lastMutation: before,
          snapshot: {
            ...current.snapshot,
            generatedAt: timestamp,
            links: [...current.snapshot.links, link],
            activities: [
              activity(
                "linked",
                sourceNode.id,
                sourceNode.label,
                `Linked to ${targetNode.label} via ${input.type.replaceAll("_", " ")}.`,
              ),
              ...current.snapshot.activities,
            ],
          },
        }));
        return link;
      },

      removeLink: (id) => {
        const existing = get().snapshot.links.find((item) => item.id === id);
        if (!existing) return;
        const timestamp = now();
        const before = copySnapshot(get().snapshot);
        set((state) => ({
          lastMutation: before,
          snapshot: {
            ...state.snapshot,
            generatedAt: timestamp,
            links: state.snapshot.links.map((item) =>
              item.id === id ? { ...item, deletedAt: timestamp, updatedAt: timestamp } : item,
            ),
          },
        }));
      },

      undoLastMutation: () => {
        const previous = get().lastMutation;
        if (!previous) return;
        set({ snapshot: previous, lastMutation: null });
      },

      resetGraph: () =>
        set({
          snapshot: initialGraph,
          selectedNodeId: null,
          inspectorOpen: false,
          highlightedNodeIds: [],
          lastMutation: null,
        }),
    }),
    {
      name: "world-creators-knowledge-network-v1",
      partialize: (state) => ({
        snapshot: state.snapshot,
        viewMode: state.viewMode,
        selectedNodeId: state.selectedNodeId,
      }),
    },
  ),
);
