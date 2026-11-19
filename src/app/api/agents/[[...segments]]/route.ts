import { runReplyTemplate } from "@/lib/server/outreach/reply-template-store";
import { renderReplyHtml } from "@/lib/server/outreach/transport/reply-html";
import { deliveryOperations, resolveCrmJob, reconcileDelivery, retryDelivery } from "@/lib/server/outreach/production-delivery";
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
import { getMessageBus } from "@/lib/server/outreach/orchestrator/bus";
import { deploymentSecret } from "@/lib/server/operator-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments?: string[] }> };
function authorised(request: NextRequest) {
  const expected = deploymentSecret("CTX_OUTREACH_OPERATOR_TOKEN");
  // The CTX dashboard has no separate user-auth service yet. Permit only
  // same-origin browser calls when no operator token is configured; external
  // callers remain rejected. A configured token always takes precedence.
  if (!expected) return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(request.nextUrl.hostname) && (request.headers.get("sec-fetch-site") === "same-origin" || request.headers.get("origin") === request.nextUrl.origin);
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
    if (segments.length===3 && segments[0]==="runs" && segments[2]==="reply-template")
      return json({template:runReplyTemplate(outreachStore(),segments[1])});
    if(segments.join("/")==="operations")return json(deliveryOperations(outreachStore()));
    if (segments.join("/") === "telemetry") {
      const query = request.nextUrl.searchParams;
      const windowValue = z.enum(["1h", "1d", "7d"]).catch("1d").parse(query.get("window"));
      const environment = z.enum(["production", "staging", "development"]).catch("production").parse(query.get("environment"));
      const region = query.get("region") ?? "all";
      const store = outreachStore();
      const now = Date.now();
      const windowMs = windowValue === "1h" ? 3600000 : windowValue === "1d" ? 86400000 : 604800000;
      const envRuns = store.list().filter(run => environment === "development" ? run.sandbox : environment === "staging" ? !run.sandbox && run.inference === "fixture" : !run.sandbox && run.inference === "live");
      const matchingRuns = envRuns.filter(run => {
        if (now - run.createdAt > windowMs) return false;
        if (region === "all") return true;
        const jurisdictionRegion: Record<string, string> = { UK: "uk-institutional", EU: "eu-private-wealth", US: "us-family-offices", Other: "apac-high-net-worth" };
        return (run.tags ?? []).includes(region) || jurisdictionRegion[run.prospect.jurisdiction ?? "UK"] === region;
      });
      const sentRuns = matchingRuns.filter(run => run.transcript.some(item => item.direction === "outbound"));
      const delivered = matchingRuns.filter(run => run.transcript.some(item => item.direction === "outbound") && run.status !== "failed");
      const outboundDelivered = delivered.reduce((count, run) => count + run.transcript.filter(item => item.direction === "outbound").length, 0);
      const inbound = matchingRuns.reduce((count, run) => count + run.transcript.filter(item => item.direction === "inbound").length, 0);
      const manual = matchingRuns.filter(run => run.humanManaged || run.transcript.some(item => item.origin === "manual_human_operator")).length;
      const samples = matchingRuns.flatMap(run => {
        const events = store.events(run.id);
        return events.map((event, index) => ({ at: event.at, runId: run.id, ms: typeof event.data === "object" && event.data !== null && "durationMs" in event.data && typeof event.data.durationMs === "number" ? event.data.durationMs : index > 0 ? Math.max(0, event.at - events[index - 1].at) : 0 }));
      });
      const latency = samples.map(sample => sample.ms).filter(ms => ms > 0).sort((a, b) => a - b);
      const percentile = (p: number) => latency.length ? latency[Math.min(latency.length - 1, Math.ceil(latency.length * p) - 1)] : 0;
      const bins = 12;
      const points = Array.from({length: bins}, (_, index) => {
        const start = now - windowMs + index * windowMs / bins;
        const end = now - windowMs + (index + 1) * windowMs / bins;
        const inBin = samples.filter(sample => sample.at >= start && sample.at < end);
        const binLatencies = inBin.map(sample => sample.ms).filter(ms => ms > 0).sort((a, b) => a - b);
        const runBin = matchingRuns.filter(run => run.createdAt >= start && run.createdAt < end);
        const sector = (key: string) => runBin.filter(run => (run.tags ?? []).includes(key) || run.prospect.tags?.includes(key)).reduce((count, run) => count + run.transcript.filter(item => item.direction === "inbound").length, 0);
        return {t: index, label: new Date(start).toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"}), p50: binLatencies[Math.floor(binLatencies.length * 0.5)] ?? 0, p95: binLatencies[Math.min(binLatencies.length - 1, Math.floor(binLatencies.length * 0.95))] ?? 0, p99: binLatencies[Math.min(binLatencies.length - 1, Math.floor(binLatencies.length * 0.99))] ?? 0, useast: sector("private_equity") + sector("us-family-offices"), uswest: sector("family_offices"), euwest: sector("precious_metals") + sector("eu-private-wealth")};
      });
      const errors = matchingRuns.filter(run => run.status === "failed" || Boolean(run.issue)).length;
      const passes = matchingRuns.filter(run => run.review?.decision === "pass" && run.deliverability?.decision === "pass").length;
      const latencyHealth = latency.length ? Math.max(0, 100 - Math.min(100, percentile(0.95) / 100)) : 100;
      const deliverabilityHealth = delivered.length ? Math.max(0, 100 - errors / delivered.length * 100) : 100;
      const complianceHealth = matchingRuns.length ? passes / matchingRuns.length * 100 : 100;
      const inflectionHealth = Math.round((latencyHealth + deliverabilityHealth + complianceHealth) / 3);
      const hosts = AGENTS.map(agent => {
        const agentRuns = matchingRuns.filter(run => run.next === agent || run.tags?.includes(`agent:${agent}`));
        const countErrors = agentRuns.filter(run => run.status === "failed" || Boolean(run.issue)).length;
        const errorRate = agentRuns.length ? countErrors / agentRuns.length * 100 : 0;
        return {id: agent, service: agent, environment, region: region === "all" ? "all regions" : region, instances: agentRuns.length, rpm: Math.round(agentRuns.length * 60000 / windowMs * 10) / 10, errorRate, p99: percentile(0.99), status: countErrors ? "critical" as const : agentRuns.some(run => ["held", "escalated", "paused"].includes(run.status)) ? "warning" as const : "healthy" as const, heartbeat: store.setting(`agent-heartbeat:${agent}`) ?? store.setting("worker-heartbeat") ?? null};
      });
      const crmJobState = store.db.prepare("SELECT state FROM crm_delivery_jobs WHERE id=? AND run_id=?");
      const bookingAudit = matchingRuns.flatMap(run => store.events(run.id)
        .filter(event => event.kind === "cal_booking_reconciled" && run.booking?.status === "confirmed")
        .map(event => {
          const data = typeof event.data === "object" && event.data !== null ? event.data as Record<string, unknown> : {};
          const currentState = (suffix: string, recorded: unknown) => {
            if (typeof data.eventId === "string") {
              const job = crmJobState.get(data.eventId + suffix, run.id);
              if (typeof job?.state === "string") return job.state;
            }
            return typeof recorded === "string" ? recorded : "unavailable";
          };
          return {
            runId: run.id,
            contactId: run.prospect.id.startsWith("lead-") ? run.prospect.id.slice("lead-".length) : "",
            bookingId: typeof data.bookingId === "string" ? data.bookingId : "",
            startsAt: run.booking?.startsAt ?? "",
            at: new Date(event.at).toISOString(),
            crmStatus: currentState(":status", data.crmStatus),
            crmNote: currentState(":briefing", data.crmNote),
          };
        })
      ).filter(booking => booking.contactId && booking.bookingId && booking.startsAt).slice(0, 20);
      for (const run of matchingRuns.filter(item => item.status === "failed" || item.status === "held" || item.status === "escalated")) {
        const id = `run-${run.id}`;
        try { store.alert(id); } catch {
          store.saveAlert({id,severity:run.status === "failed" ? "critical" : "warning",title:run.issue ?? `Workflow ${run.status}`,service:`${run.next} agent · ${run.prospect.name}`,state:"firing",at:new Date(run.createdAt).toISOString()});
        }
      }
      const alerts = store.alerts();
      return json({ generatedAt: new Date(now).toISOString(), networkStatus: "connected", kpis: [
        {key:"health",label:"Inbox placement",value:`${sentRuns.length ? Math.round(delivered.length * 1000 / sentRuns.length) / 10 : 0}%`,status: errors ? "warning" : "healthy",statusLabel:`${delivered.length} delivered · ${sentRuns.length} sent`,delta:"Live",deltaPositive:true},
        {key:"error",label:"Inbound engagement",value:`${outboundDelivered ? Math.round(inbound * 1000 / outboundDelivered) / 10 : 0}%`,status:inbound ? "healthy" : "warning",statusLabel:`${inbound} replies`,delta:"Live",deltaPositive:true},
        {key:"latency",label:"Inflection health",value:`${inflectionHealth} / 100`,status:inflectionHealth < 60 ? "critical" : inflectionHealth < 85 ? "warning" : "healthy",statusLabel:`${passes} compliance passes`,delta:"Live",deltaPositive:inflectionHealth >= 85},
        {key:"availability",label:"Autonomy ratio",value:`${matchingRuns.length ? Math.round((matchingRuns.length-manual)*1000/matchingRuns.length)/10 : 0}%`,status:manual ? "warning" : "healthy",statusLabel:`${manual} manual takeovers`,delta:"Live",deltaPositive:manual === 0}
      ], series: {points, ticks: [0, 2, 4, 6, 8, 11], tickLabels: Object.fromEntries([0,2,4,6,8,11].map(index => [index, points[index]?.label ?? ""]))}, latency: {p50:percentile(.5),p95:percentile(.95),p99:percentile(.99)}, hosts, alerts, bookingAudit, totals: {runs: matchingRuns.length, delivered: delivered.length, inbound, errors}, heartbeat: store.setting("worker-heartbeat") ?? null });
    }
    if (segments[0] === "phase1" && segments.length <= 2) return json(await phase1Context(segments[1]));
    const store = outreachStore();
    const worker = ensureOutreachWorker();
    if (!segments.length) {
      const runs = store.list();
      return json({
        externalDeliveryDisabled: process.env.CTX_LIVE_EMAIL_DISPATCH !== "true",
        worker: { booted: worker.started || Date.now()-Number(store.setting("worker-heartbeat")??0)<120000, heartbeat: store.setting("worker-heartbeat") ?? null },
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
    if (segments.join("/") === "runs") return json(store.list().map(run => ({
      ...run,
      transcript: run.transcript.map(message => ({
        ...message,
        from: message.from ?? (message.direction === "outbound" ? process.env.GMAIL_USER : run.prospect.email),
        to: message.to ?? (message.direction === "outbound" ? run.prospect.email : process.env.GMAIL_USER),
      })),
    })));
    if (segments.join("/") === "instructions") return json(store.events("orchestrator-instructions"));
    if (segments[0] === "runs" && segments.length === 2) return json({ run: store.get(segments[1]), events: store.events(segments[1]) });
    if (segments.join("/") === "sources") return json(store.sourceList());
    if (segments.join("/") === "source-events") return json(store.events("sources"));
    return json({ error: "Not found" }, 404);
  } catch { return json({ error: "Requested resource unavailable" }, 404); }
}

import { SovereignTrainer } from "@/lib/server/outreach/training/trainer";

const command = z.discriminatedUnion("action", [
  z.object({action:z.literal("refresh-sources")}).strict(),
  z.object({action:z.literal("check-delivery"),id:z.string()}).strict(),
  z.object({action:z.literal("retry-delivery"),id:z.string(),confirmUnsent:z.literal(true)}).strict(),
  z.object({action:z.literal("resolve-crm"),id:z.string(),resolution:z.enum(["retry","applied"])}).strict(),
  z.object({ action: z.literal("dispatch-instruction"), agentId: z.enum(["orchestrator", ...AGENTS]), text: z.string().trim().min(1).max(12000), documentIds: z.array(z.string().max(200)).max(20).default([]) }).strict(),
  z.object({ action: z.literal("create"), prospect: z.unknown(), mode: z.enum(["human", "automatic"]).default("human"), inference: z.enum(["fixture", "live"]).default("fixture"), syntheticAcknowledgement: z.literal(true) }).strict(),
  z.object({ action: z.literal("create-sandbox"), phase1LeadId: z.string().regex(/^lead-/), mode: z.enum(["human", "automatic"]).default("human"), inference: z.enum(["fixture", "live"]).default("fixture"), sandboxAcknowledgement: z.literal(true) }).strict(),
  z.object({ action: z.literal("approve"), id: z.string(), draftHash: z.string(), actor: z.string().min(1) }).strict(),
  z.object({ action: z.literal("edit"), id: z.string(), draft: z.unknown() }).strict(),
  z.object({ action: z.literal("reject"), id: z.string(), actor: z.string(), reason: z.string() }).strict(),
  z.object({ action: z.literal("reply"), id: z.string(), eventId: z.string(), text: z.string(), htmlTemplate: z.string().max(20000).optional(), baseTemplate: z.string().max(20000).optional() }).strict(),
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
  z.object({ action: z.literal("apply-inflection-action"), alertId: z.string().min(1).max(160), resolution: z.enum(["applied", "queued", "dismissed"]), notes: z.string().max(2000).optional() }).strict(),
]);
class ReplyTemplateConflict extends Error {}
export async function POST(request: NextRequest, context: Context) {
  if (!authorised(request)) return json({ error: "Operator authentication required" }, 401);
  if ((await context.params).segments?.length) return json({ error: "Post commands to /api/agents" }, 404);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  try {
    const raw = await request.text();
    if (raw.length > 150000) return json({ error: "Request too large" }, 413);
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return json({ error: "Invalid JSON body" }, 400); }
    const c = command.parse(payload), store = outreachStore();
    if(c.action==="refresh-sources"){store.setSetting("source-refresh-request",String(Date.now()));ensureOutreachWorker();return json({queued:true},202);}
    if(c.action==="check-delivery")return json(await reconcileDelivery(store,c.id));
    if(c.action==="retry-delivery"){retryDelivery(store,c.id);return json({ok:true});}
    if(c.action==="resolve-crm"){resolveCrmJob(store,c.id,c.resolution);return json({ok:true});}
    if (c.action === "apply-inflection-action") {
      const alert = store.alert(c.alertId);
      alert.state = c.resolution === "applied" || c.resolution === "dismissed" ? "resolved" : "acknowledged";
      store.saveAlert(alert);
      const event = { alertId: alert.id, resolution: c.resolution, notes: c.notes ?? "", title: alert.title, service: alert.service, timestamp: new Date().toISOString() };
      store.event("inflection-alerts", "operator_optimization_applied", event);
      const message = await getMessageBus().publish({ sender: "system", recipient: "*", messageType: "OPERATOR_OPTIMIZATION_APPLIED", payload: event });
      return json({ ok: true, alert, messageId: message.id });
    }
    if (c.action === "dispatch-instruction") {
      getOrchestrator();
      const instruction = { agentId: c.agentId, text: c.text, documentIds: c.documentIds, status: "received", execution: "Review required before workflow execution" };
      store.event("orchestrator-instructions", "operator_instruction_received", instruction);
      const message = await getMessageBus().publish({ sender: "system", recipient: c.agentId, messageType: "OPERATOR_INSTRUCTION_RECEIVED", payload: instruction });
      return json({ id: message.id, ...instruction }, 202);
    }
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
    if (c.action === "reply") {
      store.transaction(()=>{
        const accepted=e.reply(c.id,c.eventId,c.text);
        if(!accepted || c.htmlTemplate===undefined)return;
        if(c.baseTemplate!==undefined && c.baseTemplate!==runReplyTemplate(store,c.id))
          throw new ReplyTemplateConflict();
        renderReplyHtml("Template preview",c.htmlTemplate);
        store.setSetting("reply-html-template:"+c.id,c.htmlTemplate);
      });
    }
    if (c.action === "booking") e.booking(c.id, c.event);
    if (c.action === "resume") e.resume(c.id);
    if (c.action === "pause-run") e.pauseRun(c.id);
    if (c.action === "followup") e.followup(c.id);
    return json(store.get(c.id));
  } catch (error) {
    if(error instanceof ReplyTemplateConflict)return json({error:"Reply template changed. Reopen the editor to load the saved design."},409);
    return json({ error: error instanceof z.ZodError ? "Invalid command fields" : "Command rejected; check workflow state, source versions and approval hash" }, 400);
  }
}
