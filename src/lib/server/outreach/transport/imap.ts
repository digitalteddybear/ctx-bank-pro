import { createHash } from "node:crypto";
import { queueCrmJob } from "../production-delivery";
import { bookingResult } from "../delegated-booking";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { AllowedSentimentValue } from "../../integrations/hubspot-types";
import { OutreachEngine } from "../engine";
import { ConfigurableModel, FixtureModel } from "../models";

export const inboundReplyEventId = (uid: number, mailbox?: string) => mailbox ? "imap-"+createHash("sha256").update(mailbox+":"+uid).digest("hex") : `imap-${uid}`;

export interface InboundEmail {
  uid: number;
  uidValidity?: string;
  messageId?: string;
  mailboxId?: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  date: Date;
  inReplyTo?: string;
}

export function cleanReplyBody(text: string): string {
  if (!text) return "";
  const cutPatterns = [
    /\n\s*On\s+[\s\S]+?wrote:\s*[\s\S]*/i,
    /\n\s*---\s*Original Message\s*---[\s\S]*/i,
    /\n\s*_{2,}[\s\S]*/i,
    /\n\s*>[\s\S]*/,
  ];
  let cleaned = text;
  for (const pat of cutPatterns) {
    cleaned = cleaned.replace(pat, "");
  }
  return cleaned.trim();
}

/** Snapshot all existing message UIDs currently in INBOX from this prospect */
export async function getExistingProspectMessageUids(prospectEmail: string): Promise<Set<number>> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const existing = new Set<number>();
  if (!user || !pass || !prospectEmail) return existing;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: true },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const seqs = await client.search({ from: prospectEmail.toLowerCase().trim() });
      if (seqs && seqs.length) {
        for (const seq of seqs) {
          try {
            const msg = await client.fetchOne(seq, { uid: true });
            if (msg && msg.uid) existing.add(Number(msg.uid));
          } catch {
            // continue
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch {
    // Ignore error
  } finally {
    await client.logout().catch(() => {});
  }
  return existing;
}

export async function fetchLatestInboundReply(options: {
  prospectEmail: string;
  subjectKeyword?: string;
  processedUids?: Set<number>;
  checkpoint?: {validity:string;uids:number[]};
  minDate?: Date;
}): Promise<InboundEmail | null> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!user || !pass) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD in environment");
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: true },
    logger: false,
  });

  try {
    await client.connect();
  } catch (error) {
    await client.logout().catch(() => {});
    throw new Error(`IMAP connection failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const lock = await client.getMailboxLock("INBOX");
  try {
    const searchCriteria: Record<string, unknown> = {};
    if (options.prospectEmail) {
      searchCriteria.from = options.prospectEmail.trim().toLowerCase();
    }
    if (options.subjectKeyword) {
      searchCriteria.subject = options.subjectKeyword;
    }

    const seqs = await client.search(searchCriteria);
    if (!seqs || !seqs.length) return null;

    // Iterate backwards from newest to find latest matching prospect
    for (let i = 0; i < seqs.length; i++) {
      const seq = seqs[i];
      try {
        const msg = await client.fetchOne(seq, { uid: true, envelope: true, source: true });
        if (!msg) continue;

        const uid = Number(msg.uid);
        const validity=client.mailbox?String(client.mailbox.uidValidity):"";
        if(options.checkpoint?.validity===validity&&options.checkpoint.uids.includes(uid))continue;
        if (options.processedUids?.has(uid)) continue;

        const senderAddress = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
        const targetProspect = options.prospectEmail.toLowerCase().trim();

        const matchesSender = senderAddress === targetProspect;
        const msgDate = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();

        // Strict temporal boundary: Reply must not predate the outbound email
        if (options.minDate && msgDate.getTime() < options.minDate.getTime() - 5000) {
          continue;
        }

        if (matchesSender && msg.source) {
          const parsed = await simpleParser(msg.source) as { text?: string };
          const rawText = parsed.text ?? "";
          const cleanedText = cleanReplyBody(rawText);

          return {
            uid,
            uidValidity:validity,
            mailboxId:user+":INBOX:"+validity,
            messageId:msg.envelope?.messageId,
            from: senderAddress,
            fromName: msg.envelope?.from?.[0]?.name,
            subject: msg.envelope?.subject ?? "",
            text: cleanedText || rawText.trim(),
            date: msgDate,
            inReplyTo: msg.envelope?.inReplyTo,
          };
        }
      } catch {
        // Continue scanning
      }
    }

    return null;
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

/** Check if the human operator sent a manual email from Sent Mail to this prospect */
export async function checkOperatorSentIntervention(options: {
  prospectEmail: string;
  afterDate?: Date;
}): Promise<{ manualSentDetected: boolean; subject?: string; date?: Date } | null> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: true },
    logger: false,
  });

  try {
    await client.connect();
    let lock;
    try {
      lock = await client.getMailboxLock("[Gmail]/Sent Mail");
    } catch {
      try {
        lock = await client.getMailboxLock("Sent");
      } catch {
        return null;
      }
    }

    try {
      const searchCriteria: Record<string, unknown> = {};
      if (options.prospectEmail) {
        searchCriteria.to = options.prospectEmail;
      }
      const seqs = await client.search(searchCriteria);
      if (!seqs || !seqs.length) return null;

      for (let i = seqs.length - 1; i >= 0 && i >= seqs.length - 10; i--) {
        const msg = await client.fetchOne(seqs[i], { envelope: true, source: true });
        if (!msg) continue;
        const msgDate = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
        if (options.afterDate && msgDate.getTime() < options.afterDate.getTime() - 5000) {
          continue;
        }

        const rawSource = msg.source ? msg.source.toString() : "";
        const rawLower = rawSource.toLowerCase();
        // RFC 5322 header names are case-insensitive. Gmail normalizes X-ASP-Origin to X-Asp-Origin.
        const isAgentOutreach =
          rawLower.includes("x-asp-origin: autonomous_agent") ||
          rawLower.includes("x-asp-agent: dylan") ||
          rawLower.includes("x-asp-workflow-id") ||
          rawLower.includes("x-asp-origin");

        if (!isAgentOutreach) {
          return {
            manualSentDetected: true,
            subject: msg.envelope?.subject,
            date: msgDate,
          };
        }
      }
      return null;
    } finally {
      lock.release();
    }
  } catch {
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
}

export interface ImapListenerStats {
  lastPollAt?: number;
  totalProcessed: number;
  errors: number;
  lastError?: string;
  activeProspects: number;
}

/**
 * Single polling cycle of the automated IMAP Inbound Reply Engine.
 * Filters active database runs awaiting reply, checks Gmail inbox by In-Reply-To header
 * and prospect email, strips raw quotes, normalizes clean reply body, classifies intent,
 * and synthesizes tailored response.
 */
export async function pollActiveInboundReplies(options: {
  store: import("../store").OutreachStore;
  engine: import("../engine").OutreachEngine;
  liveSend?: boolean;
  liveCrm?: boolean;
}): Promise<{
  checked: number;
  processed: number;
  replies: Array<{ runId: string; email: InboundEmail; classification: string }>;
}> {
  const runs = options.store.list();
  const waitingRuns = runs.filter(
    (r) => ["waiting_reply", "booking_pending"].includes(r.status) && (!r.campaignId||r.transcript.some(turn=>turn.deliveryStatus==="sent")) && !options.store.isSuppressed(r.prospect.email)
  );

  if (!waitingRuns.length) {
    if (options.liveSend) await deliverControlledDemoReply(options.store, options.engine, options.liveCrm);
    return { checked: 0, processed: 0, replies: [] };
  }

  const processedReplies: Array<{ runId: string; email: InboundEmail; classification: string }> = [];

  for (const run of waitingRuns) {
    const prospectEmail = run.prospect.email.toLowerCase().trim();
    const hsId = run.prospect.id.startsWith("lead-") ? run.prospect.id.replace("lead-", "") : undefined;

    const liveCrm = options.liveCrm ?? (process.env.HUBSPOT_WRITES_ENABLED === "true");

    // Minimum date: from outbound dispatch event to avoid picking up historical threads
    const outboundEvent = options.store.events(run.id).find((e) => e.kind === "approved" || e.kind === "step_finished");
    const minDate = outboundEvent ? new Date(outboundEvent.at - 60000) : new Date(Date.now() - 3600000);

    try {
      const inbound = await fetchLatestInboundReply({
        prospectEmail,
        minDate,
        checkpoint:JSON.parse(String(options.store.setting("imap-checkpoint:"+prospectEmail)??"null"))??undefined,
      });

      if (inbound && inbound.text.trim().length > 0) {
        // Use the run's own model adapter. A mismatched runtime engine can
        // return no work immediately, leaving the reply queued indefinitely.
        const runEngine = options.engine.model.mode === run.inference
          ? options.engine
          : new OutreachEngine(options.store, run.inference === "live" ? new ConfigurableModel() : new FixtureModel());
        const accepted = runEngine.reply(run.id, inboundReplyEventId(inbound.uid,inbound.mailboxId), inbound.text, {
          from: inbound.from,
          fromName: inbound.fromName,
          to: process.env.GMAIL_USER,
          subject: inbound.subject,
          sentAt: inbound.date.toISOString(),
          externalMessageId: inbound.messageId,
        });
        const checkpointKey="imap-checkpoint:"+prospectEmail;
        const previous=JSON.parse(String(options.store.setting(checkpointKey)??'{"validity":"","uids":[]}')) as {validity:string;uids:number[]};
        const seen=previous.validity===inbound.uidValidity?previous.uids:[];
        const saveCheckpoint=()=>options.store.setSetting(checkpointKey,JSON.stringify({validity:inbound.uidValidity??"",uids:Array.from(new Set([...seen,inbound.uid]))}));
        if (!accepted){saveCheckpoint();continue;}

        // Drain engine through conversation and compliance agents
        for (let i = 0; i < 40; i++) {
          if (!(await runEngine.tick())) break;
        }

        const updatedRun = options.store.get(run.id);
        const classification = updatedRun.classification ?? "general";

        if(run.campaignId&&hsId){
          const event=inboundReplyEventId(inbound.uid,inbound.mailboxId);
          const sentiments:Record<string,AllowedSentimentValue>={interested:"Interested",question:"Question",booking:"Booking Request",opt_out:"Opt Out",not_interested:"Not Interested",unclear:"Unclear"};
          queueCrmJob(options.store,event+":reply",run.id,"inbound",{hubspotId:hsId,email:prospectEmail,messageId:inbound.messageId??event,approvedBy:"imap-worker",replyText:inbound.text,replyAt:inbound.date.toISOString(),sentiment:sentiments[classification]??"Unclear",threadId:run.id});
          queueCrmJob(options.store,event+":status",run.id,"status",{hubspotId:hsId,email:prospectEmail,messageId:event+":status",approvedBy:"imap-worker",properties:{ctx_status:classification==="opt_out"?"Opted Out":"Replied",ctx_last_contact:inbound.date.toISOString()}});
          queueCrmJob(options.store,event+":briefing",run.id,"briefing",{hubspotId:hsId,email:prospectEmail,messageId:event+":briefing",stage:classification,prospectQuote:inbound.text,agentBrief:"Prospect reply classified as "+classification+". Review the preserved conversation before consultation.",talkingPoints:["Address the prospect's explicit question.","Confirm any unresolved request from the conversation.","Use verified dossier and CRM observations."]});
          saveCheckpoint();
          processedReplies.push({runId:run.id,email:inbound,classification});
          continue;
        }
        saveCheckpoint();
        const { getHubSpotGateway } = await import("../../integrations/hubspot-gateway");
        const gateway = getHubSpotGateway();

        // Update HubSpot CRM if live CRM is active
        if (liveCrm && hsId) {
          try {
          const sentimentByClassification: Record<string, AllowedSentimentValue> = {
            booking: "Booking Request",
            question: "Question",
            interested: "Interested",
            not_interested: "Not Interested",
            out_of_office: "Out of Office",
            opt_out: "Opt Out",
            legal_threat: "Legal Threat",
            complaint: "Complaint",
            advice: "Advice Request",
            unclear: "Unclear",
          };
          const sentiment = sentimentByClassification[classification] ?? "Unclear";
          const replyLog = await gateway.logReplyEngagement({
            hubspotId: hsId,
            email: prospectEmail,
            messageId: `reply-imap-${inbound.uid}`,
            sentiment,
            replyText: inbound.text,
            replyAt: inbound.date.toISOString(),
            threadId: run.id,
          });
          options.store.event(run.id, "hubspot_inbound_reply_logged", { status: replyLog.status, messageId: `reply-imap-${inbound.uid}` });

          const conversationEvent = options.store.events(run.id).reverse().find((event) => {
            if (event.kind !== "step_finished" || typeof event.data !== "object" || event.data === null) return false;
            const data = event.data as { stage?: unknown };
            return data.stage === "conversation";
          });
          const conversationResult = conversationEvent && typeof conversationEvent.data === "object" && conversationEvent.data !== null
            ? (conversationEvent.data as { result?: unknown }).result
            : undefined;
          const agentSummary = typeof conversationResult === "object" && conversationResult !== null &&
            "summary" in conversationResult && typeof conversationResult.summary === "string"
            ? conversationResult.summary
            : `Agent classification: ${classification}. Summary unavailable; operator review may be required.`;
          const stage = classification === "booking"
            ? "Call requested"
            : classification === "opt_out"
              ? "Opt-out received"
              : updatedRun.status === "escalated"
                ? "Escalated for review"
                : "Reply received";
          const noteResult = await gateway.logBrokerBriefingNote({
            hubspotId: hsId,
            email: prospectEmail,
            messageId: `reply-imap-${inbound.uid}`,
            stage,
            prospectQuote: inbound.text.slice(0, 1500),
            agentBrief: `${agentSummary} This is a conversation triage summary, not a determination of eligibility, suitability, or investment interest beyond the prospect's own words.`,
            talkingPoints: [
              "Respond to the prospect's stated question or request.",
              "Use only verified profile and approved source material.",
              "Honor suppression requests; route advice, complaint, legal, and unclear cases for human review.",
            ],
          });
          options.store.event(run.id, "hubspot_inbound_briefing_logged", { status: noteResult.status, messageId: `reply-imap-${inbound.uid}` });

          const statusResult = await gateway.updateOutreachStatus({
            hubspotId: hsId,
            email: prospectEmail,
            messageId: `reply-status-imap-${inbound.uid}`,
            approvedBy: "automated_imap_daemon",
            properties: {
              ctx_status: classification === "opt_out" ? "Opted Out" : "Replied",
              ctx_last_contact: new Date().toISOString(),
              ctx_booking_link_sent: classification === "booking",
            },
          });
            options.store.event(run.id, "hubspot_inbound_status_updated", { status: statusResult.status, messageId: `reply-status-imap-${inbound.uid}`, error: statusResult.error });
          } catch (error) {
            options.store.event(run.id, "hubspot_inbound_sync_failed", { message: error instanceof Error ? error.message : "HubSpot inbound sync failed", messageId: `reply-imap-${inbound.uid}` });
          }
        }

        processedReplies.push({
          runId: run.id,
          email: inbound,
          classification,
        });
      }
    } catch (error) {
      options.store.event(run.id, "inbound_poll_failed", { message: error instanceof Error ? error.message : "Inbound processing failed" });
    }
  }

  if (options.liveSend) await deliverControlledDemoReply(options.store, options.engine, options.liveCrm);

  return {
    checked: waitingRuns.length,
    processed: processedReplies.length,
    replies: processedReplies,
  };
}

/** Retry a prepared reply only for the configured test contact, never a campaign lead. */
export async function deliverControlledDemoReply(
  store: import("../store").OutreachStore,
  fallbackEngine: import("../engine").OutreachEngine,
  liveCrm?: boolean,
  sendEmail?: typeof import("./email").sendLiveOutreachEmail,
) {
  const email = process.env.HUBSPOT_TEST_CONTACT_EMAIL?.toLowerCase().trim();
  const hubspotId = process.env.HUBSPOT_TEST_CONTACT_ID?.trim();
  if (!email || !hubspotId) return;

  const run = store.list().find(candidate =>
    candidate.sandbox && !candidate.humanManaged &&
    candidate.mode === "automatic" &&
    candidate.prospect.email.toLowerCase() === email &&
    (candidate.prospect.phase1LeadId ?? candidate.prospect.id).replace(/^lead-/, "") === hubspotId &&
    candidate.transcript.some(message => message.direction === "inbound") &&
    Boolean(candidate.draft) &&
    ["awaiting_approval", "waiting_reply", "booking_pending"].includes(candidate.status)
  );
  if (!run || store.isSuppressed(email) || !run.draft) return;

  const eventId = `${run.id}:${run.draft.version}`;
  const existing = run.transcript.find(message => message.direction === "outbound" && message.eventId === eventId);
  if (existing?.deliveryStatus === "sent") return;

  const engine = fallbackEngine.model.mode === run.inference
    ? fallbackEngine
    : new OutreachEngine(store, run.inference === "live" ? new ConfigurableModel() : new FixtureModel());
  if (run.status === "awaiting_approval") {
    engine.approve(run.id, run.draft.hash, "automated-controlled-demo");
    for (let i = 0; i < 40; i++) {
      if (!(await engine.tick())) break;
    }
  }

  const ready = store.get(run.id);
  if (!["waiting_reply", "booking_pending"].includes(ready.status) || !ready.draft) {
    store.event(run.id, "demo_agent_reply_not_dispatched", { status: ready.status, issue: ready.issue ?? null });
    return;
  }

  const send = sendEmail ?? (await import("./email")).sendLiveOutreachEmail;
  const delivery = await send({
    to: email,
    subject: ready.draft.subject,
    text: ready.draft.body,
    intent: "reply",
    htmlTemplate: String(store.setting("reply-html-template:"+run.id) ?? store.setting("reply-html-template") ?? process.env.CTX_REPLY_HTML_TEMPLATE ?? ""),
    runId: ready.id,
    phase1LeadId: `lead-${hubspotId}`,
    isTestRecipient: true,
  });
  if (!delivery.sent) {
    store.event(run.id, "demo_agent_reply_send_failed", { eventId, message: delivery.error ?? "SMTP did not accept the reply" });
    return;
  }

  const sentAt = new Date().toISOString();
  const messageId = delivery.messageId ?? `ctx-demo-${run.id}-${ready.draft.version}`;
  store.recordEmailDelivery(run.id, eventId, {
    from: process.env.GMAIL_USER ?? "",
    fromName: process.env.CTX_SENDER_NAME ?? "Dylan (ASP Private Capital)",
    to: email,
    subject: ready.draft.subject,
    sentAt,
    externalMessageId: messageId,
  });

  const cal = bookingResult(store,run.id);
  if(cal?.status === "confirmed" && cal.id && cal.start && !store.get(run.id).booking) engine.booking(run.id,{eventId:`cal-${cal.uid}`,bookingId:cal.id,sequence:1,startsAt:new Date(cal.start).toISOString(),status:"confirmed"});
  if (liveCrm ?? (process.env.HUBSPOT_WRITES_ENABLED === "true")) {
    try {
      const gateway = (await import("../../integrations/hubspot-gateway")).getHubSpotGateway();
      const emailResult = await gateway.logEmailEngagement({
        hubspotId,
        email,
        messageId,
        approvedBy: "automated-controlled-demo",
        subject: ready.draft.subject,
        bodyText: ready.draft.body,
        sentAt,
        threadId: run.id,
      });
      store.event(run.id, "hubspot_agent_reply_logged", { status: emailResult.status, messageId, error: emailResult.error });
      const statusResult = await gateway.updateOutreachStatus({
        hubspotId,
        email,
        messageId: `${messageId}:status`,
        approvedBy: "automated-controlled-demo",
        properties: { ctx_status: cal?.status === "confirmed" ? "Booked" : "Replied", ctx_last_contact: sentAt, ctx_booking_link_sent: ready.draft.body.includes("cal.com") },
      });
      store.event(run.id, "hubspot_agent_reply_status_updated", { status: statusResult.status, messageId: `${messageId}:status`, error: statusResult.error });
    } catch (error) {
      store.event(run.id, "hubspot_agent_reply_sync_failed", { messageId, message: error instanceof Error ? error.message : "HubSpot reply sync failed" });
    }
  }
}

/**
 * Starts the persistent automated 30-second IMAP listener daemon.
 */
export function startPersistentImapListener(options: {
  store: import("../store").OutreachStore;
  engine: import("../engine").OutreachEngine;
  pollIntervalMs?: number;
  liveSend?: boolean;
  liveCrm?: boolean;
}): {
  stop: () => void;
  isRunning: () => boolean;
  getStats: () => ImapListenerStats;
} {
  const pollInterval = options.pollIntervalMs ?? 30_000;
  let running = true;
  let timer: NodeJS.Timeout | null = null;
  let inFlight = false;

  const stats: ImapListenerStats = {
    totalProcessed: 0,
    errors: 0,
    activeProspects: 0,
  };

  const cycle = async () => {
    if (!running || inFlight) return;
    inFlight = true;
    stats.lastPollAt = Date.now();
    try {
      const result = await pollActiveInboundReplies({
        store: options.store,
        engine: options.engine,
        liveSend: options.liveSend,
        liveCrm: options.liveCrm,
      });
      stats.totalProcessed += result.processed;
      stats.activeProspects = result.checked;
    } catch (err) {
      stats.errors++;
      stats.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      inFlight = false;
      if (running) {
        timer = setTimeout(() => void cycle(), pollInterval);
      }
    }
  };

  // Kick off immediate first cycle
  void cycle();

  return {
    stop: () => {
      running = false;
      if (timer) clearTimeout(timer);
    },
    isRunning: () => running,
    getStats: () => ({ ...stats }),
  };
}

/** Reconcile an uncertain SMTP result against the sender's actual Sent mailbox. */
export async function sentMessageExists(messageId:string){
  const user=process.env.GMAIL_USER,password=process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g,"");
  if(!user||!password)throw new Error("Sender credentials are not configured.");
  const client=new ImapFlow({host:"imap.gmail.com",port:993,secure:true,auth:{user,pass:password},logger:false,connectionTimeout:10000,socketTimeout:15000});
  try{
    await client.connect();
    const sent=(await client.list()).find(mailbox=>mailbox.specialUse==="\\Sent");
    if(!sent)throw new Error("Sent mailbox was not found.");
    const lock=await client.getMailboxLock(sent.path);
    try{const messages=await client.search({header:{"message-id":messageId}},{uid:true});return Boolean(messages&&messages.length);}
    finally{lock.release();}
  }finally{await client.logout().catch(()=>{});}
}
