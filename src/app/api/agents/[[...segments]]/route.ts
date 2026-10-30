import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureOutreachWorker, outreachEngine, outreachStore } from "@/lib/server/outreach/runtime";
import { phase1Context, phase1SandboxProspect } from "@/lib/server/outreach/phase1";
import { AGENTS } from "@/lib/server/outreach/types";
import { approveSource, importSource } from "@/lib/server/outreach/sources";

import { getAgentProfiles } from "@/lib/server/outreach/profiles";
import { getModelRegistry } from "@/lib/server/outreach/training/registry";
import { getOrchestrator } from "@/lib/server/outreach/orchestrator/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments?: string[] }> };
function authorised(request: NextRequest) {
  const expected = process.env.CTX_OUTREACH_OPERATOR_TOKEN;
  // The CTX dashboard has no separate user-auth service yet. Permit only
  // same-origin browser calls when no operator token is configured; external
  // callers remain rejected. A configured token always takes precedence.
  if (!expected) return request.headers.get("sec-fetch-site") === "same-origin" || request.headers.get("origin") === request.nextUrl.origin;
  if (expected.length < 24) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest, context: Context) {
  if (!authorised(request)) return json({ error: "Operator authentication required; API disabled unless a token is configured" }, 401);
  const segments = (await context.params).segments ?? [];
  try {
    if (segments[0] === "phase1" && segments.length <= 2) return json(await phase1Context(segments[1]));
    const store = outreachStore();
    const worker = ensureOutreachWorker();
    if (!segments.length) {
      const runs = store.list();
      return json({
        externalDeliveryDisabled: true,
        worker: { booted: worker.started, heartbeat: store.setting("worker-heartbeat") ?? null },
        sandboxRuns: runs.filter(r => r.sandbox).length,
        globalPaused: store.setting("paused") === "true",
        campaignPaused: store.setting("campaign-paused") === "true",
        agents: AGENTS.map(id => ({ id, paused: store.setting(`agent-paused:${id}`) === "true", runs: runs.filter(r => r.next === id).map(r => ({ id: r.id, state: r.status, sandbox: r.sandbox, inference: r.inference, issue: r.issue })) })),
        runCount: runs.length,
        profiles: getAgentProfiles(),
        orchestrator: getOrchestrator().getNetworkState(),
      });
    }
    if (segments.join("/") === "profiles") return json(getAgentProfiles());
    if (segments.join("/") === "models") return json(getModelRegistry().listCheckpoints());
    if (segments.join("/") === "orchestrator") return json(getOrchestrator().getNetworkState());
    if (segments.join("/") === "runs") return json(store.list());
    if (segments[0] === "runs" && segments.length === 2) return json({ run: store.get(segments[1]), events: store.events(segments[1]) });
    if (segments.join("/") === "sources") return json(store.sourceList());
    if (segments.join("/") === "source-events") return json(store.events("sources"));
    return json({ error: "Not found" }, 404);
  } catch { return json({ error: "Requested resource unavailable" }, 404); }
}

import { SovereignTrainer } from "@/lib/server/outreach/training/trainer";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), prospect: z.unknown(), mode: z.enum(["human", "automatic"]).default("human"), inference: z.enum(["fixture", "live"]).default("fixture"), syntheticAcknowledgement: z.literal(true) }).strict(),
  z.object({ action: z.literal("create-sandbox"), phase1LeadId: z.string().regex(/^lead-/), mode: z.enum(["human", "automatic"]).default("human"), inference: z.enum(["fixture", "live"]).default("fixture"), sandboxAcknowledgement: z.literal(true) }).strict(),
  z.object({ action: z.literal("approve"), id: z.string(), draftHash: z.string(), actor: z.string().min(1) }).strict(),
  z.object({ action: z.literal("edit"), id: z.string(), draft: z.unknown() }).strict(),
  z.object({ action: z.literal("reject"), id: z.string(), actor: z.string(), reason: z.string() }).strict(),
  z.object({ action: z.literal("reply"), id: z.string(), eventId: z.string(), text: z.string() }).strict(),
  z.object({ action: z.literal("booking"), id: z.string(), event: z.unknown() }).strict(),
  z.object({ action: z.enum(["resume", "pause-run", "followup"]), id: z.string() }).strict(),
  z.object({ action: z.literal("pause"), scope: z.enum(["global", "campaign", ...AGENTS]), paused: z.boolean() }).strict(),
  z.object({ action: z.literal("import-source"), source: z.unknown() }).strict(),
  z.object({ action: z.literal("approve-source"), id: z.string(), hash: z.string(), reviewer: z.string().min(1) }).strict(),
  z.object({ action: z.literal("train-agent"), agentId: z.enum(AGENTS), version: z.string().default("1.1.0") }).strict(),
  z.object({ action: z.literal("broadcast-event"), source: z.enum(["regulatory", "macro_market", "company_policy"]), title: z.string(), description: z.string() }).strict(),
  z.object({ action: z.literal("clear-sandbox-runs") }).strict(),
  z.object({ action: z.literal("clear-all-runs") }).strict(),
  z.object({ action: z.literal("takeover"), id: z.string(), reason: z.string().default("Operator manual takeover from dashboard") }).strict(),
]);
export async function POST(request: NextRequest, context: Context) {
  if (!authorised(request)) return json({ error: "Operator authentication required" }, 401);
  if ((await context.params).segments?.length) return json({ error: "Post commands to /api/agents" }, 404);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  try {
    const raw = await request.text(); if (raw.length > 150000) return json({ error: "Request too large" }, 413);
    const c = command.parse(JSON.parse(raw)), store = outreachStore();
    if (c.action === "clear-sandbox-runs") {
      const count = store.clearSandboxRuns();
      return json({ ok: true, clearedCount: count });
    }
    if (c.action === "clear-all-runs") {
      const count = store.clearAllRuns();
      return json({ ok: true, clearedCount: count });
    }
    if (c.action === "create") return json(outreachEngine(c.inference).create(c.prospect, c.mode), 201);
    if (c.action === "create-sandbox") return json(outreachEngine(c.inference).createSandbox(await phase1SandboxProspect(c.phase1LeadId), c.mode), 201);
    if (c.action === "import-source") return json(importSource(store, c.source));
    if (c.action === "approve-source") { approveSource(store, c.id, c.hash, c.reviewer); return json({ ok: true }); }
    if (c.action === "pause") { outreachEngine("fixture").pause(c.scope, c.paused); return json({ ok: true }); }
    if (c.action === "train-agent") {
      const trainer = new SovereignTrainer();
      const outcome = await trainer.trainAgent({
        agentId: c.agentId,
        targetVersion: c.version,
        samples: [
          {
            id: `manual-${c.agentId}`,
            agentId: c.agentId,
            instruction: `Instruction tuning for ${c.agentId}`,
            input: "Synthetic training context",
            output: "Target sovereign domain output",
            domain: "sovereign_adaptation",
            source: "operator_trigger",
            createdAt: new Date().toISOString(),
          },
        ],
        epochs: 3,
        autoPromote: true,
      });
      return json(outcome, 201);
    }
    if (c.action === "broadcast-event") {
      const orchestrator = getOrchestrator();
      const message = await orchestrator.broadcastExternalEvent({
        source: c.source,
        title: c.title,
        description: c.description,
        details: {},
      });
      return json({ ok: true, message }, 201);
    }
    if (c.action === "takeover") {
      const r = store.get(c.id);
      r.humanManaged = true;
      r.status = "held";
      r.issue = `HUMAN_OPERATOR_TAKEOVER: ${c.reason}`;
      r.escalationQueue = "human_operator";
      r.tags = Array.from(new Set([...(r.tags ?? []), "human_managed", "agent_yielded_to_human"]));
      store.cancel(r.id);
      store.save(r);
      store.event(r.id, "human_operator_takeover", { reason: c.reason, actor: "dashboard-operator" });
      return json(r);
    }
    const e = outreachEngine(store.get(c.id).inference);
    if (c.action === "approve") e.approve(c.id, c.draftHash, c.actor);
    if (c.action === "edit") e.edit(c.id, c.draft);
    if (c.action === "reject") e.reject(c.id, c.actor, c.reason);
    if (c.action === "reply") e.reply(c.id, c.eventId, c.text);
    if (c.action === "booking") e.booking(c.id, c.event);
    if (c.action === "resume") e.resume(c.id);
    if (c.action === "pause-run") e.pauseRun(c.id);
    if (c.action === "followup") e.followup(c.id);
    return json(store.get(c.id));
  } catch (error) {
    return json({ error: error instanceof z.ZodError ? "Invalid command fields" : "Command rejected; check workflow state, source versions and approval hash" }, 400);
  }
}
