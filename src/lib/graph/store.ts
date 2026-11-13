"use client";

import { create } from "zustand";
import type { GraphSnapshot } from "./types";

export type ViewMode = "dashboard" | "network" | "sources" | "agents" | "architecture" | "catalog" | "ai-settings" | "ai-chat";
export type SyncState = "connecting" | "live" | "stale" | "error";

interface GraphStore {
  snapshot: GraphSnapshot;
  selectedNodeId: string | null;
  selectedChatId: string | null;
  viewMode: ViewMode;
  searchQuery: string;
  inspectorOpen: boolean;
  commandOpen: boolean;
  highlightedNodeIds: string[];
  syncState: SyncState;
  lastSyncedAt: string | null;
  sidebarOpen: boolean;
  setSnapshot: (snapshot: GraphSnapshot) => void;
  selectNode: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedChatId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setInspectorOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setHighlightedNodes: (ids: string[]) => void;
  setSyncState: (state: SyncState) => void;
  updateNodeTags: (id: string, tags: string[]) => void;
}

export const useGraphStore = create<GraphStore>((set) => ({
  snapshot: { schemaVersion: "1.0", generatedAt: "", nodes: [], links: [], activities: [] },
  selectedNodeId: null,
  selectedChatId: null,
  viewMode: "dashboard",
  searchQuery: "",
  inspectorOpen: false,
  commandOpen: false,
  highlightedNodeIds: [],
  syncState: "connecting",
  lastSyncedAt: null,
  sidebarOpen: true,

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSnapshot: (snapshot) =>
    set((state) => {
      const selectedStillExists =
        !state.selectedNodeId ||
        snapshot.nodes.some((node) => node.id === state.selectedNodeId && !node.deletedAt);
      const unchanged =
        state.snapshot.generatedAt === snapshot.generatedAt &&
        state.snapshot.nodes.length === snapshot.nodes.length &&
        state.snapshot.links.length === snapshot.links.length;

      return {
        snapshot: unchanged ? state.snapshot : snapshot,
        selectedNodeId: selectedStillExists ? state.selectedNodeId : null,
        inspectorOpen: selectedStillExists ? state.inspectorOpen : false,
        syncState: "live",
        lastSyncedAt: new Date().toISOString(),
      };
    }),
  selectNode: (selectedNodeId) =>
    set({
      selectedNodeId,
      inspectorOpen: Boolean(selectedNodeId),
    }),
  setViewMode: (viewMode) =>
    set((state) => ({
      viewMode,
      inspectorOpen: viewMode === "network" ? state.inspectorOpen : false,
    })),
  setSelectedChatId: (selectedChatId) => set({ selectedChatId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setHighlightedNodes: (highlightedNodeIds) => set({ highlightedNodeIds }),
  setSyncState: (syncState) => set({ syncState }),
  updateNodeTags: (id, tags) =>
    set((state) => ({
      snapshot: {
        ...state.snapshot,
        nodes: state.snapshot.nodes.map((node) =>
          node.id === id ? { ...node, tags } : node
        ),
      },
    })),
}));
