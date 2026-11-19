"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GraphSnapshot } from "@/lib/graph/types";
import type { ViewMode } from "@/lib/graph/store";

export interface SyncRuntimeStatus {
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

export interface SyncDocumentSummary {
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

interface UseBackendSyncOptions {
  profileReady: boolean;
  profileRole: "administrator" | "guest";
  viewMode: ViewMode;
  hasSnapshot: boolean;
  hasDocuments: boolean;
  setSnapshot: (snapshot: GraphSnapshot) => void;
  setRuntime: (status: SyncRuntimeStatus) => void;
  setDocuments: (documents: SyncDocumentSummary[]) => void;
  setSyncState: (state: "connecting" | "live" | "stale" | "error") => void;
  onInitialSyncComplete?: () => void;
}

const BASE_POLL_MS = 4_000;
const MAX_BACKOFF_MS = 15_000;

export function useBackendSync({
  profileReady,
  profileRole,
  viewMode,
  hasSnapshot,
  hasDocuments,
  setSnapshot,
  setRuntime,
  setDocuments,
  setSyncState,
  onInitialSyncComplete,
}: UseBackendSyncOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const errorCountRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const completedInitialRef = useRef(false);

  const needsGraph = !hasSnapshot || !["ai-chat", "ai-settings", "catalog", "architecture"].includes(viewMode);
  const needsDocs = !hasDocuments || viewMode === "dashboard" || viewMode === "sources";

  const syncBackend = useCallback(async () => {
    if (!profileReady) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (profileRole === "guest") {
        const response = await fetch("/api/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Backend sync failed");
        setRuntime((await response.json()) as SyncRuntimeStatus);
        errorCountRef.current = 0;
        if (!completedInitialRef.current) {
          completedInitialRef.current = true;
          onInitialSyncComplete?.();
        }
        return;
      }

      const [graphResponse, statusResponse, documentsResponse] = await Promise.all([
        needsGraph ? fetch("/api/graph", { cache: "no-store", signal: controller.signal }) : Promise.resolve(null),
        fetch("/api/status", { cache: "no-store", signal: controller.signal }),
        needsDocs ? fetch("/api/documents", { cache: "no-store", signal: controller.signal }) : Promise.resolve(null),
      ]);

      if (
        (graphResponse && !graphResponse.ok) ||
        !statusResponse.ok ||
        (documentsResponse && !documentsResponse.ok)
      ) {
        throw new Error("Backend sync failed");
      }

      const [graph, status, ingestionDocuments] = await Promise.all([
        graphResponse ? (graphResponse.json() as Promise<GraphSnapshot>) : Promise.resolve(null),
        statusResponse.json() as Promise<SyncRuntimeStatus>,
        documentsResponse ? (documentsResponse.json() as Promise<SyncDocumentSummary[]>) : Promise.resolve(null),
      ]);

      if (graph) setSnapshot(graph);
      setRuntime(status);
      if (ingestionDocuments) setDocuments(ingestionDocuments);

      errorCountRef.current = 0;
      if (!completedInitialRef.current) {
        completedInitialRef.current = true;
        onInitialSyncComplete?.();
      }
      window.dispatchEvent(new Event("ctx:backend-updated"));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      setSyncState("error");
      if (!completedInitialRef.current) {
        completedInitialRef.current = true;
        onInitialSyncComplete?.();
      }
    }
  }, [
    needsDocs,
    needsGraph,
    onInitialSyncComplete,
    profileReady,
    profileRole,
    setDocuments,
    setRuntime,
    setSnapshot,
    setSyncState,
  ]);

  useEffect(() => {
    if (!profileReady) return;
    let active = true;

    const scheduleNext = () => {
      if (!active) return;
      const delay =
        errorCountRef.current === 0
          ? BASE_POLL_MS
          : Math.min(BASE_POLL_MS * 2 ** errorCountRef.current, MAX_BACKOFF_MS);
      timerRef.current = window.setTimeout(() => {
        void syncBackend().finally(scheduleNext);
      }, delay);
    };

    const initialSync = window.setTimeout(() => {
      void syncBackend().finally(scheduleNext);
    }, 0);

    const onResume = () => {
      if (document.visibilityState === "visible") {
        void syncBackend();
      }
    };
    const onManualSync = () => void syncBackend();

    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("ctx:backend-sync", onManualSync);

    return () => {
      active = false;
      window.clearTimeout(initialSync);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      abortRef.current?.abort();
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("ctx:backend-sync", onManualSync);
    };
  }, [profileReady, syncBackend]);

  return { syncBackend };
}
