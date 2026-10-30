"use client";

import { create } from "zustand";
import type { GraphSnapshot } from "./types";

export type ViewMode = "dashboard" | "network" | "sources" | "agents";
export type SyncState = "connecting" | "live" | "stale" | "error";

interface GraphStore {
  snapshot: GraphSnapshot;
  selectedNodeId: string | null;
  viewMode: ViewMode;
  searchQuery: string;
  inspectorOpen: boolean;
  commandOpen: boolean;
  highlightedNodeIds: string[];
  syncState: SyncState;
  lastSyncedAt: string | null;
  setSnapshot: (snapshot: GraphSnapshot) => void;
  selectNode: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setInspectorOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setHighlightedNodes: (ids: string[]) => void;
  setSyncState: (state: SyncState) => void;
}

export const useGraphStore = create<GraphStore>((set) => ({
  snapshot: { schemaVersion: "1.0", generatedAt: "", nodes: [], links: [], activities: [] },
  selectedNodeId: null,
  viewMode: "dashboard",
  searchQuery: "",
  inspectorOpen: false,
  commandOpen: false,
  highlightedNodeIds: [],
  syncState: "connecting",
  lastSyncedAt: null,

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
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setHighlightedNodes: (highlightedNodeIds) => set({ highlightedNodeIds }),
  setSyncState: (syncState) => set({ syncState }),
}));
