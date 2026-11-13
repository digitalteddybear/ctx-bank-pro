import { contactMemory } from './contact-memory';
import { callbackTask, relativeCallback, saveCallback } from "./callbacks";
import { arrangeBooking, delegatedRequest } from "./delegated-booking";
import { conversationSignals, hasRoleDisclosure, normaliseReply, repeatsAnswer } from "./conversation-policy";
import { HubSpotContextStore } from "../integrations/hubspot-context";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { OutreachStore, hash } from "./store";
import { fingerprint, usableDeliverabilitySources, usableSources, evaluateApplicability } from "./sources";
import { AGENTS, BOOKING_URL, MAX_SOURCE_AGE, SENDER, responseSchemas, syntheticProspect, sandboxProspect, type Agent, type ModelAdapter, type Run, type Stage, type RegulatorySource, type SandboxProspect } from "./types";
import { traceable } from "langsmith/traceable";
import { interpolateOpeningMessage, openingMessageFieldsFromText } from "./message-template";
import {
  detectHumanTakeover,
  isAgentInstigatedThread,
  validatePhase1Contact,
  TAG_PHASE1_VALIDATED,
  TAG_AGENT_INSTIGATED,
  TAG_HUMAN_MANAGED,
  TAG_AGENT_YIELDED,
  VALUE_ASP_AUTONOMOUS_AGENT,
} from "./safeguards";

const hardStops = /\b(unsubscribe|stop(?: emailing| contacting| messaging)?|remove me|do not contact|don't contact)\b/i;
const legalThreats = /\b(legal action|sue you|take you to court|see you in court|report you to the ico|gdpr breach|retain counsel|solicitor|lawyer|litigation)\b/i;
const complaints = /\b(formal complaint|i (?:want to|will) complain|harassment|report you)\b/i;
const advice = /\b(should i invest|recommend.*(?:invest|fund)|suitable for me|tax advice|pension transfer)\b/i;
const promptInjection = /\b(ignore (?:all )?previous instructions|system prompt|override (?:security|rules)|<script)\b/i;
const misleading = /\b(guaranteed (?:returns?|yields?)|(?:fixed|target|minimum) yields?|risk[ -]?free|capital (?:is )?protected|we recommend (?:you|invest)|suitable for you|fca.approved|fca.authorised|invest now)\b/i;
const terminal = new Set(["suppressed", "escalated", "held", "failed", "paused", "booked"]);
type Job = { id: string; run_id: string; revision: number; stage: Stage; owner: string; attempts: number };

function createBookingUrl(store: OutreachStore, runId: string): string {
  store.db.exec("CREATE TABLE IF NOT EXISTS booking_references(ref_hash TEXT PRIMARY KEY,run_id TEXT NOT NULL,created_at INTEGER NOT NULL,consumed_at INTEGER)");
  const reference=randomBytes(32).toString("base64url");
  store.db.prepare("INSERT INTO booking_references(ref_hash,run_id,created_at) VALUES(?,?,?)").run(hash(reference),runId,Date.now());
  const url=new URL(BOOKING_URL);
  // Cal.com returns user_id as webhook metadata. The value is random and the
  // database stores only its hash; no recipient or CRM identifier is exposed.
  url.searchParams.set("user_id",reference);
  return url.toString();
}

export class OutreachEngine {
  constructor(readonly store: OutreachStore, readonly model: ModelAdapter) {}

  create(input: unknown, mode: "human" | "automatic" = "human") {
    const prospect = syntheticProspect.parse(input);
    if (!["human", "automatic"].includes(mode)) throw new Error("Invalid mode");
    const run: Run = {
      id: randomUUID(),
      campaign: "relationship-reactivation",
      prospect: { ...prospect, dossier: prospect.facts.map(f => `${f.source}: ${f.text}`).join("\n") } as SandboxProspect,
      sandbox: false,
      mode,
      inference: this.model.mode,
      synthetic: true,
      revision: 0,
      status: "queued",
      next: "prospect",
      transcript: [],
      intent: "initial",
      corrections: 0,
      draftCounter: 0,
      followups: 0,
      createdAt: Date.now(),
    };

    this.store.transaction(() => {
      if (this.store.list().some(r => r.prospect.email.toLowerCase() === prospect.email.toLowerCase() && !terminal.has(r.status))) {
        throw new Error("Prospect already has an active simulation");
      }
      this.store.save(run);
      this.store.event(run.id, "created", { mode, inference: this.model.mode, synthetic: true });

      // Contact permission gate evaluation
      const subscriberType = prospect.subscriberType ?? "individual";
      const lawfulBasis = prospect.lawfulBasis ?? "consent";
      const pecrCondition = prospect.pecrCondition ?? "consent";

      if (this.store.isSuppressed(prospect.email)) {
        run.contactPermission = { decision: "block", reason: "Prospect is suppressed", subscriberType, lawfulBasis, pecrCondition, evaluatedAt: Date.now() };
        this.hold(run, "Prospect is suppressed", "suppressed");
      } else if (prospect.permission !== "granted") {
        run.contactPermission = { decision: "hold", reason: "Permission missing, denied or suppressed", subscriberType, lawfulBasis, pecrCondition, evaluatedAt: Date.now() };
        this.hold(run, "Permission missing, denied or suppressed");
      } else if (subscriberType === "individual" && lawfulBasis === "legitimate_interests" && pecrCondition !== "soft_opt_in_pecr_22_3") {
        run.contactPermission = { decision: "hold", reason: "Individual subscriber direct marketing requires prior consent or PECR reg 22(3) soft opt-in; legitimate interests alone is insufficient", subscriberType, lawfulBasis, pecrCondition, evaluatedAt: Date.now() };
        this.hold(run, "Individual subscriber direct marketing requires prior consent or PECR reg 22(3) soft opt-in; legitimate interests alone is insufficient");
      } else {
        run.contactPermission = { decision: "pass", reason: "Lawful basis and PECR condition verified", subscriberType, lawfulBasis, pecrCondition, evaluatedAt: Date.now() };
        this.store.enqueue(run, "prospect");
      }
    });
    return this.store.get(run.id);
  }

  createSandbox(input: unknown, mode: "human" | "automatic" = "human") { return this.createValidated(input,mode,true); }
  createCampaignProspect(input: unknown, mode: "human" | "automatic", campaignId: string) { return this.createValidated(input,mode,false,campaignId); }
  private createValidated(input: unknown, mode: "human" | "automatic", sandbox: boolean, campaignId?: string) {
    const prospect = sandboxProspect.parse(input);
    if(!sandbox&&prospect.permission!=="granted")throw new Error("Record contact permission before campaign enrollment.");
    const phase1Check = validatePhase1Contact(prospect);
    if (!phase1Check.valid) {
      throw new Error(phase1Check.reason);
    }
    const runId=campaignId ? "campaign-"+campaignId+"-"+prospect.id : randomUUID();
    if(campaignId&&this.store.db.prepare("SELECT id FROM runs WHERE id=?").get(runId))return this.store.get(runId);
    const run: Run = {
      id: runId,
      campaign: "relationship-reactivation",
      campaignId,
      prospect: {
        ...prospect,
        phase1Validated: true,
        phase1LeadId: phase1Check.leadId,
        tags: Array.from(new Set([...(prospect.tags ?? []), TAG_PHASE1_VALIDATED, "asp_approved_cohort"])),
      } as never,
      sandbox,
      mode,
      inference: this.model.mode,
      synthetic: false,
      revision: 0,
      status: "queued",
      next: "prospect",
      transcript: [],
      intent: "initial",
      corrections: 0,
      draftCounter: 0,
      followups: 0,
      tags: [TAG_PHASE1_VALIDATED, "campaign:relationship-reactivation"],
      createdAt: Date.now(),
    };
    this.store.transaction(() => {
      if (this.store.list().some(r => r.prospect.email.toLowerCase() === prospect.email.toLowerCase() && !terminal.has(r.status))) {
        throw new Error("Prospect already has an active sandbox run");
      }
      this.store.save(run);
      this.store.event(run.id, sandbox ? "sandbox_created" : "campaign_run_created", { mode, inference: this.model.mode, source: prospect.id, phase1LeadId: phase1Check.leadId });
      this.store.enqueue(run, "prospect");
    });
    return this.store.get(run.id);
  }

  private hold(run: Run, issue: string, status: Run["status"] = "held") {
    run.status = status;
    run.issue = issue;
    this.store.cancel(run.id);
    this.store.save(run);
    this.store.event(run.id, status, { issue, queue: run.escalationQueue });
  }

  private invalidate(run: Run) {
    run.revision++;
    run.approval = undefined;
    run.review = undefined;
    this.store.cancel(run.id);
  }

  private safe(run: Run) {
    if (!run.sandbox && (run.prospect.permission !== "granted" || this.store.isSuppressed(run.prospect.email))) {
      throw new Error("COMPLIANCE_HOLD: permission or suppression");
    }
    if (this.store.setting("paused") === "true" || this.store.setting("campaign-paused") === "true") {
      throw new Error("COMPLIANCE_HOLD: campaign or global pause");
    }
  }

  pause(scope: "global" | "campaign" | Agent, paused: boolean) {
    const key = scope === "global" ? "paused" : scope === "campaign" ? "campaign-paused" : `agent-paused:${scope}`;
    if (!["global", "campaign", ...AGENTS].includes(scope)) throw new Error("Invalid pause scope");
    this.store.transaction(() => {
      this.store.setSetting(key, String(paused));
      this.store.event("operations", "pause_changed", { scope, paused });
    });
  }

  pauseRun(id: string) {
    this.store.transaction(() => {
      const r = this.store.get(id);
      this.invalidate(r);
      this.hold(r, "Paused by operator", "paused");
    });
  }

  resume(id: string) {
    this.store.transaction(() => {
      const r = this.store.get(id);
      if (!["paused", "failed", "held"].includes(r.status)) throw new Error("Run cannot be resumed");
      this.safe(r);
      this.invalidate(r);
      r.issue = undefined;
      this.store.enqueue(r, r.draft ? "compliance" : r.next === "dispatch" ? "outreach" : r.next);
      this.store.event(id, "resumed", {});
    });
  }

  approve(id: string, draftHash: string, actor: string) {
    if (!actor.trim()) throw new Error("Reviewer identity required");
    this.store.transaction(() => {
      const r = this.store.get(id);
      this.safe(r);
      if (r.status !== "awaiting_approval" || r.draft?.hash !== draftHash || r.review?.decision !== "pass" || r.review.draftHash !== draftHash) {
        throw new Error("Approval is stale or review did not pass");
      }
      if (r.review.sourceFingerprint !== fingerprint(usableSources(this.store, r.inference))) {
        throw new Error("COMPLIANCE_HOLD: policy changed");
      }
      r.approval = { actor, draftHash };
      this.store.event(id, "approved", r.approval);
      this.store.enqueue(r, "dispatch");
    });
  }

  edit(id: string, input: unknown) {
    const draft = responseSchemas.outreach.parse(input);
    this.store.transaction(() => {
      const r = this.store.get(id);
      if (!["awaiting_approval", "held", "queued"].includes(r.status)) throw new Error("Run is not editable");
      this.invalidate(r);
      r.draftCounter++;
      r.draft = { ...draft, version: r.draftCounter, hash: hash(draft) };
      r.corrections = 0;
      this.store.event(id, "draft_edited", r.draft);
      this.store.enqueue(r, "compliance");
    });
  }

  reject(id: string, actor: string, reason: string) {
    z.string().min(1).max(100).parse(actor);
    z.string().min(1).max(2000).parse(reason);
    this.store.transaction(() => {
      const r = this.store.get(id);
      this.invalidate(r);
      this.hold(r, `Operator rejected: ${reason}`, "escalated");
      this.store.event(id, "rejected", { actor, reason });
    });
  }

  reply(id: string, eventId: string, text: string, metadata?: { sentByHuman?: boolean; from?: string; fromName?: string; to?: string; subject?: string; sentAt?: string; externalMessageId?: string }): boolean {
    z.string().min(1).max(12000).parse(text);
    z.string().min(1).max(150).parse(eventId);
    let accepted = false;
    this.store.transaction(() => {
      const r = this.store.get(id);
      if (!this.store.receipt(`reply:${eventId}`, { id, text })) return;
      accepted = true;

      const paused = r.status === "paused", escalated = r.status === "escalated";
      this.invalidate(r);
      r.transcript.push({ direction: "inbound", text, eventId, origin: metadata?.sentByHuman ? "manual_human_operator" : "inbound_prospect", from: metadata?.from ?? r.prospect.email, fromName: metadata?.fromName, to: metadata?.to ?? process.env.GMAIL_USER, subject: metadata?.subject, sentAt: metadata?.sentAt ?? new Date().toISOString(), externalMessageId: metadata?.externalMessageId });
      const previousCallback=callbackTask(this.store,r.id);
      if(previousCallback&&previousCallback.status==="scheduled"){previousCallback.status="cancelled";this.store.setSetting(`callback:${r.id}`,JSON.stringify(previousCallback));}
      r.intent = "reply";
      r.draft = undefined;
      r.corrections = 0;
      this.store.event(id, "reply_received", { eventId, origin: metadata?.sentByHuman ? "manual_human_operator" : "inbound_prospect", simulated: false });

      // Prioritised classification rules
      if (hardStops.test(text)) {
        this.store.db.prepare("INSERT OR REPLACE INTO suppressed VALUES (?,?)").run(r.prospect.email.toLowerCase(), "Prospect opted out");
        for (const sibling of this.store.list().filter(item => item.id !== r.id && item.prospect.email.toLowerCase() === r.prospect.email.toLowerCase())) {
          this.invalidate(sibling);
          this.hold(sibling, "Prospect opted out", "suppressed");
        }
        this.hold(r, "Prospect opted out", "suppressed");
      } else if (this.store.isSuppressed(r.prospect.email)) {
        this.hold(r, "Suppression remains in force", "suppressed");
      } else if (legalThreats.test(text)) {
        r.escalationQueue = "legal_team";
        this.hold(r, "Legal threat detected: routed to legal_team queue", "escalated");
      } else if (promptInjection.test(text)) {
        r.escalationQueue = "legal_team";
        this.hold(r, "Prompt injection attempt detected: routed to legal_team queue", "escalated");
      } else if (complaints.test(text)) {
        r.escalationQueue = "compliance_officer";
        this.hold(r, "Formal complaint detected: routed to compliance_officer queue", "escalated");
      } else if (advice.test(text)) {
        r.escalationQueue = "compliance_officer";
        this.hold(r, "Advice or complaint requires human handling", "escalated");
      } else {
        // Safeguard: Human Takeover Guard — yield immediately if operator intervened
        const takeover = detectHumanTakeover(text, metadata);
        if (takeover.takeoverDetected) {
          r.humanManaged = true;
          r.escalationQueue = "human_operator";
          r.tags = Array.from(new Set([...(r.tags ?? []), TAG_HUMAN_MANAGED, TAG_AGENT_YIELDED]));
          this.hold(r, takeover.reason ?? "Human operator engaged prospect directly; autonomous agent yielded control.", "escalated");
          this.store.event(id, "human_operator_takeover", { eventId, text, reason: takeover.reason });
          return;
        }

        if (escalated) {
          this.hold(r, "Reply recorded; human escalation remains unresolved", "escalated");
        } else if (paused) {
          r.next = "conversation";
          this.hold(r, "Reply recorded; operator pause retained", "paused");
        } else {
          // Safeguard: Thread Instigation Guard — never take over uninstigated threads
          const instigation = isAgentInstigatedThread(r.transcript);
          if (!instigation.instigatedByAgent) {
            this.hold(r, instigation.reason ?? "NON_INTERFERENCE: Thread not instigated by agent", "held");
            return;
          }
          this.store.enqueue(r, "conversation");
        }
      }
    });
    return accepted;
  }

  followup(id: string, delayMs = 3 * 86400000) {
    if (delayMs < 0 || !Number.isFinite(delayMs)) throw new Error("Invalid delay");
    this.store.transaction(() => {
      const r = this.store.get(id);
      this.safe(r);
      if (r.status !== "waiting_reply" || r.followups >= 2 || r.transcript.some(t => t.direction === "inbound")) {
        throw new Error("Follow-up not permitted");
      }
      this.invalidate(r);
      r.intent = "followup";
      r.followups++;
      r.draft = undefined;
      r.corrections = 0;
      this.store.enqueue(r, "outreach", delayMs);
      this.store.event(id, "followup_scheduled", { delayMs });
    });
  }

  booking(id: string, input: unknown) {
    const event = z.object({
      eventId: z.string().min(1),
      bookingId: z.string().min(1),
      sequence: z.number().int().positive(),
      startsAt: z.string().datetime(),
      status: z.enum(["confirmed", "cancelled"]),
    }).strict().parse(input);

    this.store.transaction(() => {
      const r = this.store.get(id);
      if (!this.store.receipt(`booking:${event.eventId}`, { id, ...event })) return;
      if (r.booking && (r.booking.id !== event.bookingId || event.sequence <= r.booking.sequence)) {
        throw new Error("Booking conflict or out-of-order event");
      }
      if (!r.booking && r.status !== "booking_pending") throw new Error("No pending booking handoff");
      this.invalidate(r);
      r.booking = { id: event.bookingId, sequence: event.sequence, startsAt: event.startsAt, status: event.status };
      r.status = this.store.isSuppressed(r.prospect.email) ? "suppressed" : event.status === "confirmed" ? "booked" : "held";
      r.issue = event.status === "cancelled" ? "Booking cancelled; follow-up requires operator review" : undefined;
      this.store.save(r);
      this.store.event(id, "simulated_booking_event", event);
      // This command is a local workflow event. Only a verified Cal webhook
      // may enqueue CRM effects after confirming an external booking.
    });
  }

  private claim(): Job | undefined {
    return this.store.transaction(() => {
      if (this.store.setting("paused") === "true" || this.store.setting("campaign-paused") === "true") return;
      const rows = this.store.db.prepare("SELECT * FROM jobs WHERE (state='queued' AND due<=?) OR (state='running' AND lease<?) ORDER BY due LIMIT 100").all(Date.now(), Date.now());
      for (const row of rows) {
        const r = this.store.get(String(row.run_id));
        const stage = String(row.stage) as Stage;
        if(r.campaignId&&this.store.setting("campaign-paused:"+r.campaignId)==="true")continue;
        if (r.revision !== row.revision || terminal.has(r.status)) {
          this.store.db.prepare("UPDATE jobs SET state='cancelled' WHERE id=?").run(row.id);
          continue;
        }
        if (stage !== "dispatch" && this.store.setting(`agent-paused:${stage}`) === "true") continue;
        if (r.inference !== this.model.mode) continue;
        const owner = randomUUID();
        this.store.db.prepare("UPDATE jobs SET state='running',owner=?,lease=?,attempts=attempts+1 WHERE id=?").run(owner, Date.now() + 120000, row.id);
        r.status = "running";
        this.store.save(r);
        this.store.event(r.id, "step_started", { stage, jobId: row.id, inference: this.model.mode });
        return { id: String(row.id), run_id: r.id, revision: Number(row.revision), stage, owner, attempts: Number(row.attempts) + 1 };
      }
    });
  }

  async tick() {
    const job = this.claim();
    if (!job) return false;
    let result: unknown, sources: RegulatorySource[] = [], issue: string | undefined, bookingUrl = "";
    const snapshot = this.store.get(job.run_id);
    try {
      this.safe(snapshot);
      if (job.stage !== "dispatch") {
        bookingUrl = job.stage === "outreach" && snapshot.transcript.some(turn => turn.direction === "inbound") ? createBookingUrl(this.store, snapshot.id) : "";
        if (job.stage === "compliance") sources = usableSources(this.store, snapshot.inference);
        if (job.stage === "deliverability") sources = usableDeliverabilitySources(this.store, snapshot.inference);
        const schedulingReply = job.stage === "outreach" ? await arrangeBooking(this.store, snapshot, bookingUrl) : undefined;
        const context = {
          schedulingReply,
          inboundAt:snapshot.transcript.filter(t=>t.direction==="inbound").at(-1)?.sentAt,
          assessment:(()=>{const raw=this.store.setting(`assessment:${snapshot.id}`);return raw?JSON.parse(String(raw)):undefined;})(),
          actionResults:{callback:callbackTask(this.store,snapshot.id)},
          campaign: snapshot.campaign,
          prospect: snapshot.prospect,
          profileDossier: snapshot.prospect.dossier,
          contactHistory: contactMemory(this.store,snapshot),
          crmContext: (() => { try { return new HubSpotContextStore(this.store).context((snapshot.prospect.phase1LeadId ?? "").replace(/^lead-/, "")); } catch { return undefined; } })(),
          campaignPreferences: (() => { const saved=this.store.setting("campaign-run-settings:"+snapshot.id);if(saved)return JSON.parse(String(saved)) as unknown; try { const row=this.store.db.prepare("SELECT value FROM outreach_preferences WHERE key='campaign'").get(); return row ? JSON.parse(String(row.value)) as unknown : {openingMessage:"",replyGuidance:""}; } catch { return {openingMessage:"",replyGuidance:""}; } })(),
          brief: snapshot.brief,
          draft: snapshot.draft,
          previousReview: snapshot.review,
          transcript: snapshot.transcript.filter(turn => turn.direction === "inbound" || snapshot.inference === "fixture" || turn.deliveryStatus === "sent").map(turn => ({...turn, role: turn.direction === "inbound" ? "prospect" : "dylan"})),
          conversationSignals: conversationSignals(snapshot.transcript.filter(turn => turn.direction === "inbound").at(-1)?.text ?? ""),
          latestReply: snapshot.transcript.filter(t => t.direction === "inbound").at(-1)?.text,
          classification: snapshot.classification,
          intent: snapshot.intent,
          messagePhase: snapshot.transcript.some(turn => turn.direction === "inbound") ? "reply" : "opening",
          bookingUrl,
          sources,
          synthetic: snapshot.synthetic,
          sandbox: snapshot.sandbox,
          noExternalActions: snapshot.sandbox,
        };
        const tracedStageInvoke = traceable(
          async (stage: Exclude<Stage, "dispatch">, ctx: typeof context) => this.model.invoke(stage, ctx),
          {
            name: `outreach-${job.stage}`,
            run_type: "chain",
            project_name: process.env.LANGSMITH_PROJECT || "ctx-local",
          }
        );
        result = responseSchemas[job.stage].parse(await tracedStageInvoke(job.stage, context));
      }
    } catch (error) {
      issue = error instanceof Error && error.message.startsWith("COMPLIANCE_HOLD:") ? error.message : "MODEL_UNAVAILABLE_OR_INVALID_OUTPUT";
    }
    this.store.transaction(() => {
      const row = this.store.db.prepare("SELECT owner,state FROM jobs WHERE id=?").get(job.id);
      const r = this.store.get(job.run_id);
      if (row?.owner !== job.owner || row.state !== "running" || r.revision !== job.revision) return;
      if (this.store.setting("paused") === "true" || this.store.setting("campaign-paused") === "true" || (job.stage !== "dispatch" && this.store.setting(`agent-paused:${job.stage}`) === "true")) {
        this.store.db.prepare("UPDATE jobs SET state='queued',lease=0 WHERE id=?").run(job.id);
        r.status = "queued";
        this.store.save(r);
        return;
      }
      this.store.db.prepare("UPDATE jobs SET state='done' WHERE id=?").run(job.id);
      if (issue) {
        if (issue.startsWith("COMPLIANCE_HOLD:") || job.attempts >= 3) {
          this.hold(r, issue, issue.startsWith("COMPLIANCE_HOLD:") ? "held" : "failed");
        } else {
          this.store.db.prepare("UPDATE jobs SET state='queued',due=?,lease=0 WHERE id=?").run(Date.now() + 1000 * 2 ** job.attempts, job.id);
          r.status = "queued";
          r.issue = issue;
          this.store.save(r);
        }
        this.store.event(r.id, "step_failed", { stage: job.stage, issue, attempts: job.attempts });
        return;
      }
      try {
        this.apply(r, job.stage, result, sources, bookingUrl);
      } catch (error) {
        this.hold(r, error instanceof Error ? error.message : "Invalid workflow result");
      }
      this.store.event(r.id, "step_finished", { stage: job.stage, status: r.status, result: result ?? null, inference: this.model.mode });
    });
    return true;
  }

  private apply(r: Run, stage: Stage, result: unknown, sources: RegulatorySource[], bookingUrl = "") {
    this.safe(r);
    r.issue = undefined;
    if (stage === "prospect") {
      const brief = responseSchemas.prospect.parse(result);
      if (brief.sources.some(s => !r.prospect.facts.some(f => f.source === s))) {
        throw new Error("Brief cites an unavailable source");
      }
      r.brief = brief;
      this.store.enqueue(r, "outreach");
    } else if (stage === "outreach") {
      const generated = responseSchemas.outreach.parse(result);
      const configured = JSON.parse(String(this.store.setting("campaign-run-settings:"+r.id) ?? this.store.db.prepare("SELECT value FROM outreach_preferences WHERE key='campaign'").get()?.value ?? "{}")) as {openingMessage?:string;standardFooter?:string};
      const isOpening = !r.transcript.some(turn=>turn.direction==="outbound");
      const contactProperties=(()=>{try{return new HubSpotContextStore(this.store).context((r.prospect.phase1LeadId??"").replace(/^lead-/,""))?.properties;}catch{return undefined;}})();
      const templateFields=openingMessageFieldsFromText(r.prospect.name,[r.prospect.dossier??"",...r.prospect.facts.map(fact=>fact.text)].join("\n"),{standardFooter:configured.standardFooter,contactProperties});
      const templateResult=isOpening&&configured.openingMessage?.trim()?interpolateOpeningMessage(configured.openingMessage,templateFields):undefined;
      if(templateResult?.missing.length)throw new Error(`Opening message requires verified profile fields: ${templateResult.missing.join(", ")}`);
      let draft = templateResult ? {...generated,body:templateResult.text} : generated;
      if(isOpening)draft={...draft,body:draft.body.replace(/https?:\/\/(?:www\.)?cal\.com\/asp-private-capital\/opportunities(?:\?[^\s)<>]*)?/gi,"").replace(/[ \t]+([,.!?])/g,"$1")};
      if (!isOpening && r.classification === "booking" && !delegatedRequest(r.transcript.filter(t=>t.direction==="inbound").at(-1)?.text ?? "") && (!bookingUrl || !draft.body.includes(bookingUrl))) throw new Error("Booking reply must include its per-run booking link.");
      r.draftCounter++;
      r.draft = { ...draft, version: r.draftCounter, hash: hash(draft) };
      r.approval = undefined;
      this.store.event(r.id, "draft_created", r.draft);
      this.store.enqueue(r, "deliverability");
    } else if (stage === "conversation") {
      const c = responseSchemas.conversation.parse(result);
      const inbound=r.transcript.filter(t=>t.direction==="inbound").at(-1)!;
      if(c.assessment?.evidence.some(quote=>!inbound.text.includes(quote)))throw new Error("Assessment evidence does not match the inbound message");
      if(c.assessment)this.store.setSetting(`assessment:${r.id}`,JSON.stringify({...c.assessment,sourceEventId:inbound.eventId,policyVersion:1}));
      const deferred=c.assessment?.callback?.requested || conversationSignals(inbound.text).timingDeferral;
      if(deferred && !["opt_out","legal_threat","complaint","advice"].includes(c.classification)) {
        const deterministic=relativeCallback(inbound.text,inbound.sentAt??new Date().toISOString());
        const task=saveCallback(this.store,r,deterministic??c.assessment?.callback?.dueAt??null,c.assessment?.callback?.channel);
        c.classification="interested";
        c.summary=task.dueAt?"Callback request saved":"Callback timing needs clarification";
      }
      if(c.classification!=="unclear")this.store.setSetting(`clarification:${r.id}`,"0");
      r.classification = c.classification;
      if (c.escalationQueue) r.escalationQueue = c.escalationQueue;

      // Local and synthetic replies are handled here. The live inbound
      // transport will create HubSpot outbox jobs only after authenticated IMAP ingest.

      if (c.classification === "opt_out") {
        this.store.db.prepare("INSERT OR REPLACE INTO suppressed VALUES (?,?)").run(r.prospect.email.toLowerCase(), "Classified opt-out");
        this.hold(r, c.summary, "suppressed");
      } else if (c.classification === "legal_threat") {
        r.escalationQueue = "legal_team";
        this.hold(r, c.summary, "escalated");
      } else if (["complaint", "advice"].includes(c.classification)) {
        r.escalationQueue = "compliance_officer";
        this.hold(r, c.summary, "escalated");
      } else if (c.classification === "unclear") {
        const count=Number(this.store.setting(`clarification:${r.id}`)??0);
        if(count<1){this.store.setSetting(`clarification:${r.id}`,String(count+1));this.store.enqueue(r,"outreach");}
        else {r.escalationQueue="broker_dylan";this.hold(r,c.summary,"escalated");}
      } else if (["not_interested", "out_of_office"].includes(c.classification)) {
        this.hold(r, c.summary);
      } else {
        // CRM mutations never run from this local workflow path.
        this.store.enqueue(r, "outreach");
      }
    } else if (stage === "deliverability") {
      if (!r.draft) throw new Error("No draft to assess");
      const assessment = responseSchemas.deliverability.parse(result);
      const current = usableDeliverabilitySources(this.store, r.inference);
      if (fingerprint(current) !== fingerprint(sources)) throw new Error("Deliverability sources changed during review");
      if (sources.some(s => !assessment.citations.some(c => c.sourceId === s.id && c.hash === s.hash && s.text.includes(c.quote)))) {
        throw new Error("Deliverability assessment lacks valid source citations");
      }
      r.deliverability = { ...assessment, draftHash: r.draft.hash, sourceFingerprint: fingerprint(sources), reviewedAt: Date.now() };
      this.store.event(r.id, "deliverability_review", r.deliverability);
      if (assessment.decision === "pass") this.store.enqueue(r, "compliance");
      else if (assessment.decision === "revise" && r.corrections < 2) {
        r.corrections++;
        this.store.enqueue(r, "outreach");
      } else {
        this.hold(r, assessment.summary, assessment.decision === "block" || assessment.decision === "revise" ? "held" : "escalated");
      }
    } else if (stage === "compliance") {
      if (!r.draft) throw new Error("No draft to review");
      const review = responseSchemas.compliance.parse(result);
      const current = usableSources(this.store, r.inference);
      if (fingerprint(current) !== fingerprint(sources)) throw new Error("Sources changed during review");
      if (sources.some(s => !review.citations.some(c => c.sourceId === s.id && c.hash === s.hash && s.text.includes(c.quote))) || review.citations.some(c => !sources.some(s => s.id === c.sourceId && s.hash === c.hash && s.text.includes(c.quote)))) {
        throw new Error("Review lacks valid source citations");
      }
      const text = r.draft.subject + "\n" + r.draft.body;
      if (misleading.test(text) || !text.includes("ASP Private Capital") || !/stop|opt.out|unsubscribe|no further emails/i.test(r.draft.body)) {
        review.decision = "block";
        review.summary = "Deterministic wording/disclosure check failed";
      }
      const isOpeningMessage = !r.transcript.some(turn => turn.direction === "outbound");
      const delivered = r.transcript.filter(turn => turn.direction === "outbound" && (r.inference === "fixture" || turn.deliveryStatus === "sent"));
      const historyText = delivered.map(turn => turn.text).join("\n");
      if (!isOpeningMessage && !/\b(?:introducer|liaison)s?\b/i.test(historyText + "\n" + r.draft.body) && review.decision === "pass") {
        review.decision = "revise";
        review.summary = "Briefly explain ASP’s introducer/non-adviser role naturally; it has not yet been established.";
      }
      const signals = conversationSignals(r.transcript.filter(turn => turn.direction === "inbound").at(-1)?.text ?? "");
      const repeated = delivered.some(turn => normaliseReply(turn.text) === normaliseReply(r.draft!.body)) || repeatsAnswer(r.draft.body,delivered.map(turn=>turn.text));
      if (!isOpeningMessage && review.decision === "pass" && (repeated || (signals.nextStep && !signals.delegatedBooking && !r.draft.body.includes("cal.com/")))) {
        review.decision = "revise";
        review.summary = repeated ? "Do not repeat the previous answer. Address the latest question and provide the missing next step." : "Answer the request to get started with the supplied per-run booking link.";
      }
      // Gate 2: Financial promotion & Perimeter checks
      if (/\b(aslan|crypto fund)\b/i.test(text)) {
        review.decision = "block";
        review.summary = "Managed crypto fund is legally unclassified; cannot equate fund units with direct qualifying cryptoassets under PS23/6. Qualified legal review required.";
      }
      if (/\b(b2b exemption|wealth exemption|exempt because b2b)\b/i.test(text)) {
        review.decision = "block";
        review.summary = "B2B status or wealth labels alone are not statutory financial promotion exemptions under FSMA s21.";
      }
      const fabricatedRelationship = /\b(dinner|our meeting|we spoke|as discussed (?:on|during|over)|spoke on the phone|met last week|prior discussion|our phone call|agreed during our)\b/i;
      if (fabricatedRelationship.test(text) && !r.prospect.facts.some(f => fabricatedRelationship.test(f.text)) && !(r.prospect.dossier && fabricatedRelationship.test(r.prospect.dossier))) {
        review.decision = "block";
        review.summary = "Fabricated relationship claim: draft implies prior meeting or conversation without factual grounding in prospect dossier.";
      }
      // Perimeter rule: Specific opportunities are never disclosed until consultation
      const specificOpportunityDisclosure = /\b(we have a specific (?:opportunity|deal)|offering a specific (?:opportunity|deal)|specific opportunity in|specific deal in|exclusive allocation|invest in [a-z0-9_-]+ (?:fund|note|project|company|ltd|plc)|term sheet|\b\d+%\s*(?:yield|return|coupon|irr)\b|offering \d+k|offering £|target fund size)\b/i;
      const disclosesSpecific = specificOpportunityDisclosure.test(text);
      if (disclosesSpecific) {
        review.decision = "block";
        review.summary = "Perimeter violation: Specific opportunities must never be disclosed prior to a consultation call or meeting with ASP. Outreach is strictly limited to gathering interest in ASP as private market liaisons and relaying general macroeconomic information in managed funds, private equity, or precious metals.";
      }
      if (!["block", "escalate"].includes(review.decision) && r.classification === "booking" && !signals.delegatedBooking && !r.draft.body.includes(BOOKING_URL)) {
        review.decision = "revise";
        review.summary = "Booking handoff must include the approved booking link";
      }

      r.review = { ...review, draftHash: r.draft.hash, sourceFingerprint: fingerprint(sources), reviewedAt: Date.now() };
      r.promotionReview = {
        isInvitationOrInducement: /discuss.*interests|opportunities|invest/i.test(text),
        instrumentCategory: /\b(crypto fund|aslan)\b/i.test(text) ? "cryptoasset" : /\bloan notes?\b/i.test(text) ? "loan_note" : "unspecified",
        promotionRoute: review.decision === "pass" ? "non_promotional_factual" : "unclear_requires_review",
        specificOpportunitiesDisclosed: disclosesSpecific,
        decision: review.decision === "revise" ? "hold" : review.decision,
        reason: review.summary,
        requiresQualifiedReview: review.decision !== "pass",
        evaluatedAt: Date.now(),
      };

      this.store.event(r.id, "compliance_review", r.review);
      if (review.decision === "pass") {
        if (r.mode === "automatic") this.store.enqueue(r, "dispatch");
        else {
          r.status = "awaiting_approval";
          this.store.save(r);
        }
      } else if (review.decision === "revise" && r.corrections < (repeated || signals.nextStep ? 1 : 2)) {
        r.corrections++;
        this.store.enqueue(r, "outreach");
      } else {
        this.hold(r, review.summary, review.decision === "block" ? "held" : "escalated");
      }
    } else {
      // Stage: dispatch
      const sourcesNow = usableSources(this.store, r.inference);
      if (!r.draft || r.review?.decision !== "pass" || r.review.draftHash !== r.draft.hash || r.review.sourceFingerprint !== fingerprint(sourcesNow) || Date.now() - r.review.reviewedAt > MAX_SOURCE_AGE || (r.mode === "human" && r.approval?.draftHash !== r.draft.hash)) {
        throw new Error("Dispatch blocked: stale review, policy or approval");
      }

      // Live atomic re-validation at dispatch
      if (this.store.isSuppressed(r.prospect.email)) {
        throw new Error("Dispatch blocked: live suppression in force");
      }
      if (r.humanManaged) {
        throw new Error("Dispatch blocked: thread has been taken over by human operator; agent intervention prohibited");
      }
      if (r.sandbox) {
        const phase1Check = validatePhase1Contact(r.prospect);
        if (!phase1Check.valid) {
          throw new Error(`Dispatch blocked by Phase 1 perimeter check: ${phase1Check.reason}`);
        }
      }
      const appCheck = evaluateApplicability(
        "ASP Consulting Partners Ltd",
        "introducer_liaison",
        r.draft.body.includes("crypto fund") ? "aslan_crypto_fund" : "none",
        r.prospect.subscriberType ?? "individual",
        "email",
        r.prospect.jurisdiction ?? "UK"
      );
      if (!appCheck.allowed) {
        throw new Error(`Dispatch blocked by applicability matrix: ${appCheck.restrictionReason}`);
      }

      const id = `${r.id}:${r.draft.version}`;
      const production=!r.sandbox&&!r.synthetic&&r.inference==="live";
      const message = { id, from: SENDER, to: r.prospect.email, subject: r.draft.subject, body: r.draft.body, simulated: !production, sandbox: r.sandbox, externalDelivery: production };
      const inserted = this.store.db.prepare("INSERT OR IGNORE INTO outbox VALUES (?,?,?)").run(id, r.id, JSON.stringify(message));
      if (inserted.changes) {
        r.transcript.push({
          direction: "outbound",
          text: r.draft.body,
          eventId: id,
          origin: VALUE_ASP_AUTONOMOUS_AGENT,
          from: process.env.GMAIL_USER ?? SENDER,
          fromName: process.env.CTX_SENDER_NAME ?? "Dylan (ASP Private Capital)",
          to: r.prospect.email,
          subject: r.draft.subject,
          sentAt: new Date().toISOString(),
          deliveryStatus: production ? "queued" : "simulated",
          tags: [TAG_AGENT_INSTIGATED, TAG_PHASE1_VALIDATED],
        });
        this.store.event(r.id, production ? "delivery_queued" : r.sandbox ? "sandbox_simulated_dispatch" : "simulated_dispatch", message);
        this.store.event(r.id, "simulated_crm_activity", { messageId: id, prospectId: r.prospect.id, externalWrite: false });
        // This path records simulated dispatch only; confirmed SMTP accepts
        // are the only source allowed to create CRM outbox work.
      }
      r.status = r.classification === "booking" ? "booking_pending" : "waiting_reply";
      this.store.save(r);
    }
  }
}
