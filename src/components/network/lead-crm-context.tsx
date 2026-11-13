"use client";
import { useState, useRef, useEffect } from "react";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { z } from "zod";
import { useBackendRefresh, requestBackendSync } from "@/lib/backend-sync";

const responseSchema = z.object({
  contact: z.object({
    snapshot: z.object({
      observedAt: z.string(),
      revision: z.string(),
      properties: z.record(z.string(), z.string().nullable()),
    }),
    indexState: z.string(),
    error: z.string().nullable(),
  }).nullable(),
  proposals: z.array(z.unknown()),
});

export function LeadCrmContext({ id }: { id: string }) {
  const [data, setData] = useState<z.infer<typeof responseSchema> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSyncSuccess, setLastSyncSuccess] = useState<string | null>(null);
  const active = useRef(id);
  active.current = id;
  const [loadedId, setLoadedId] = useState("");

  const refresh = async () => {
    try {
      const response = await fetch(`/api/integrations/hubspot/context?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("CRM context unavailable. Operator access may be required.");
      const result = responseSchema.parse(await response.json());
      if (active.current === id) {
        setData(result);
        setLoadedId(id);
        setError("");
      }
    } catch (e) {
      if (active.current === id) setError(e instanceof Error ? e.message : "CRM read failed");
    }
  };

  useEffect(() => {
    void refresh();
  }, [id]);

  useBackendRefresh(refresh);

  const sync = async () => {
    setBusy(true);
    setError("");
    setLastSyncSuccess(null);
    try {
      const response = await fetch("/api/integrations/hubspot/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const result = z.object({
        error: z.string().optional(),
        results: z.array(z.object({ status: z.string() })).optional(),
      }).parse(await response.json());
      if (!response.ok || result.results?.some((r) => r.status === "failed")) {
        throw new Error(result.error ?? "Some contacts could not be synchronized. Review sync events.");
      }
      await refresh();
      requestBackendSync();
      setLastSyncSuccess(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "CRM sync failed");
    } finally {
      setBusy(false);
    }
  };

  const contact = loadedId === id ? data?.contact : null;

  return (
    <VStack gap={3} padding={4} as="section" style={{ border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", background: "rgba(255, 255, 255, 0.02)" }}>
      <VStack gap={1}>
        <Text style={{ fontWeight: 600, fontSize: "14px" }}>HubSpot CRM Snapshot (Inbound)</Text>
        <Text style={{ fontSize: "12px", opacity: 0.7 }}>
          Pulls live properties from HubSpot into this dossier for AI agent context. Read-only observation.
        </Text>
      </VStack>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={busy}
          onClick={() => void sync()}
          label={busy ? "Reading HubSpot..." : "Sync from HubSpot"}
        />
        {busy && <Text style={{ fontSize: "12px", color: "#3b82f6" }}>Fetching from HubSpot API...</Text>}
        {lastSyncSuccess && (
          <Text style={{ fontSize: "12px", color: "#10b981" }}>
            ✓ Synced at {lastSyncSuccess}
          </Text>
        )}
      </div>

      {error && (
        <div style={{ padding: "8px 12px", borderRadius: "6px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
          <Text style={{ color: "#ef4444", fontSize: "12px" }}>⚠ {error}</Text>
        </div>
      )}

      {contact ? (
        <VStack gap={2}>
          <Text style={{ fontSize: "12px", opacity: 0.7 }}>
            Observed: {contact.snapshot.observedAt} · Index: {contact.indexState}
          </Text>
          {contact.error && (
            <Text style={{ color: "#f59e0b", fontSize: "12px" }}>
              Last read failed. Values below are historical: {contact.error}
            </Text>
          )}
          {Object.entries(contact.snapshot.properties)
            .filter(([, v]) => v !== null && v !== "")
            .map(([name, value]) => (
              <VStack gap={1} key={name}>
                <Text style={{ fontSize: "11px", opacity: 0.6, textTransform: "uppercase" }}>{name}</Text>
                <Text style={{ fontSize: "13px", overflowWrap: "anywhere" }}>{value}</Text>
              </VStack>
            ))}
          <Text style={{ fontSize: "12px", opacity: 0.6 }}>
            Pending proposals: {data?.proposals.length ?? 0}. Proposals are not confirmed CRM values.
          </Text>
        </VStack>
      ) : (
        <Text style={{ fontSize: "12px", opacity: 0.6 }}>No verified CRM snapshot stored for this lead yet.</Text>
      )}
    </VStack>
  );
}
