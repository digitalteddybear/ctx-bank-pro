import { reconcileCalRun } from './cal-reconciliation';
import { readReplyTemplate, saveReplyTemplate } from './reply-template-store';
import { outreachStore } from "./store-instance";
import { OutreachEngine } from "./engine";
import { ConfigurableModel, FixtureModel, outreachModelConfig } from "./models";
import { usableSources, usableDeliverabilitySources, seedFixtureSources } from "./sources";
import { sendLiveOutreachEmail } from "./transport/email";
import { fetchLatestInboundReply, inboundReplyEventId } from "./transport/imap";
import { getHubSpotGateway } from "../integrations/hubspot-gateway";
import { HubSpotReadClient } from "../integrations/hubspot-schema";
import { CampaignRegistry } from "./campaigns";
import { interpolateOpeningMessage, openingMessageFieldsFromText } from "./message-template";
import { getHubSpotAuditLogger } from "../integrations/hubspot-audit";
import {
  validateTestRecipientBoundary,
  getControlledTestRecords,
  registerOperatorTestRecipient,
} from "./test-boundary";

export const DEFAULT_FIRST_MESSAGE = `Hello,
We are following up regarding your recorded private-market profile (profile information held in our knowledge bank). The purpose of our outreach is to gather interest into ASP Private Capital as private market liaisons. Specific opportunities are never disclosed until an introductory consultation call or meeting with ASP. The furthest we go regarding opportunities is sharing general macroeconomic perspectives across our operating sectors: managed funds, private equity, and precious metals. We act as a capital introducer and liaison, not an investment adviser. If you are interested in discussing macroeconomic developments across these sectors, please let us know.
Reply stop if you would prefer no further contact.
ASP Private Capital`;

type HubSpotDemoProperties = {ctx_status:string|null;ctx_last_contact:string|null;ctx_booking_link_sent:string|null};
type VerifiedDemoContact = {crmProperties:HubSpotDemoProperties;templateProperties:Record<string,string|null>};
async function readVerifiedDemoContact(hubspotId:string,email:string):Promise<VerifiedDemoContact>{
  const contact=await new HubSpotReadClient().contact(hubspotId,["email","firstname","ctx_status","ctx_last_contact","ctx_booking_link_sent"]);
  if(contact.id!==hubspotId||contact.archived||contact.properties.email?.trim().toLowerCase()!==email.toLowerCase())throw new Error("HubSpot Contact ID and email did not match; demo stopped before CRM mutation.");
  return {
    crmProperties:{ctx_status:contact.properties.ctx_status??null,ctx_last_contact:contact.properties.ctx_last_contact??null,ctx_booking_link_sent:contact.properties.ctx_booking_link_sent??null},
    templateProperties:contact.properties,
  };
}

export interface DemoStatus {
  recipientEmail: string;
  recipientName: string;
  hubspotContactId: string;
  gmailUser: string | null;
  liveEmailConfigured: boolean;
  hubspotWritesConfigured: boolean;
  hubspotWritesEnabled: boolean;
  modelReady: boolean;
  modelConfigured: boolean;
  activeRun: import("./types").Run | null;
  recentAuditLogs: Array<{
    timestamp: string;
    operation: string;
    decision: string;
    status: string;
    httpStatus?: number;
  }>;
}

export function getDemoStatus(): DemoStatus {
  const store = outreachStore();
  const testRecords = getControlledTestRecords();
  const primary = testRecords[0] ?? {
    email: process.env.HUBSPOT_TEST_CONTACT_EMAIL || "digitalteddybear2002@gmail.com",
    hubspotId: process.env.HUBSPOT_TEST_CONTACT_ID || "908035561662",
    name: process.env.HUBSPOT_TEST_CONTACT_NAME || "Dylan",
  };

  const runs = store.list();
  const activeRun =
    runs
      .filter((r) => r.prospect.email.toLowerCase() === primary.email.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

  const auditLogger = getHubSpotAuditLogger();
  const recentLogs = auditLogger.listRecent(6).map((log) => ({
    timestamp: new Date(log.timestamp).toISOString(),
    operation: log.operation,
    decision: log.decision,
    status: log.status,
    httpStatus: log.httpStatus,
  }));

  return {
    recipientEmail: primary.email,
    recipientName: primary.name,
    hubspotContactId: primary.hubspotId,
    gmailUser: process.env.GMAIL_USER ?? null,
    liveEmailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    hubspotWritesConfigured: Boolean(process.env.HUBSPOT_ACCESS_TOKEN),
    hubspotWritesEnabled: process.env.HUBSPOT_WRITES_ENABLED === "true",
    modelReady: Boolean(store.setting("lead-outreach-settings")) || outreachModelConfig().ready,
    modelConfigured: Boolean(store.setting("lead-outreach-settings")) || outreachModelConfig().configured,
    activeRun,
    recentAuditLogs: recentLogs,
  };
}

export function clearInteractiveDemoRun(runId: string) {
  const store = outreachStore();
  return store.transaction(() => {
    const run = store.get(runId);
    const identity = run.prospect.phase1LeadId ?? run.prospect.id;
    const boundary = validateTestRecipientBoundary(run.prospect.email, identity);
    if (!run.sandbox || !boundary.valid || boundary.testRecord?.hubspotId !== identity.replace(/^lead-/, "")) {
      throw new Error("Only the controlled demo conversation can be cleared for retry.");
    }
    if (run.status === "booked") throw new Error("A confirmed booking cannot be cleared from the demo record.");
    store.cancel(run.id);
    run.revision += 1;
    run.status = "failed";
    run.issue = "Cleared for operator demo retry";
    store.save(run);
    store.event(run.id, "demo_cleared_for_retry", { actor: "operator", reason: "Clear CTX inbox slate before a fresh controlled demo" });
    return { ok: true, runId: run.id, visibleInInbox: false };
  });
}

export async function getDemoRunStatus(runId: string, verifyCrm = false) {
  const store = outreachStore();
  await reconcileCalRun(store,store.get(runId));
  const run = store.get(runId);
  if (!run) throw new Error("Workflow run not found.");
  let crmProperties: Record<string, string | null> | null = null;
  if (verifyCrm) {
    const contactId = (run.prospect.phase1LeadId ?? run.prospect.id).replace(/^lead-/, "");
    crmProperties=(await readVerifiedDemoContact(contactId,run.prospect.email)).crmProperties;
  }
  return { ok: true, booked: run.status === "booked" && run.booking?.status === "confirmed", run, booking: run.booking ?? null, crmProperties };
}

async function drainEngine(engine: OutreachEngine, maxTicks = 40) {
  for (let i = 0; i < maxTicks && (await engine.tick()); i++);
}

async function advanceRunUntil(
  engine: OutreachEngine,
  store: ReturnType<typeof outreachStore>,
  runId: string,
  desired: readonly import("./types").Status[],
  timeoutMs = 30_000,
) {
  const terminal = new Set<import("./types").Status>(["held", "escalated", "suppressed", "failed", "paused", "booked"]);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = store.get(runId);
    if (desired.includes(run.status) || terminal.has(run.status)) return run;
    await engine.tick();
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for workflow review; run=${store.get(runId).status}`);
}

export async function startInteractiveDemo(options: {
  liveSend?: boolean;
  liveCrm?: boolean;
  useLiveModel?: boolean;
  prospectName?: string;
  prospectEmail?: string;
  hubspotContactId?: string;
  customSubject?: string;
  customBody?: string;
  replyHtmlTemplate?: string;
}) {
  const store = outreachStore();

  if (!store.sourceList().length) seedFixtureSources(store);

  // Register designated operator test recipient if custom email/name provided
  const target = registerOperatorTestRecipient({
    email: options.prospectEmail || process.env.HUBSPOT_TEST_CONTACT_EMAIL || "digitalteddybear2002@gmail.com",
    name: options.prospectName || process.env.HUBSPOT_TEST_CONTACT_NAME || "Dylan",
    hubspotId: options.hubspotContactId || process.env.HUBSPOT_TEST_CONTACT_ID || "908035561662",
  });

  const recipientEmail = target.email;
  const hubspotContactId = target.hubspotId;
  const nameArg = target.name;

  const liveSend = Boolean(options.liveSend);
  const liveCrm = Boolean(options.liveCrm);
  const useLiveModel = options.useLiveModel ?? (Boolean(store.setting("lead-outreach-settings")) || outreachModelConfig().configured);
  if (useLiveModel && !store.setting("lead-outreach-settings") && !outreachModelConfig().ready) throw new Error("Live model setup incomplete. Configure GEMINI_API_KEY and CTX_OUTREACH_WRITER_MODEL; custom providers also require CTX_OUTREACH_MODEL_URL.");

  if (useLiveModel) { usableSources(store,"live"); usableDeliverabilitySources(store,"live"); }
  if (liveCrm) {
    if (!process.env.HUBSPOT_ACCESS_TOKEN?.trim()) {
      throw new Error("Live CRM requires HUBSPOT_ACCESS_TOKEN configured in environment.");
    }
    process.env.HUBSPOT_WRITES_ENABLED = "true";
  }

  let hubspotReadStatus: string | null = null;
  let hubspotProperties: HubSpotDemoProperties | null = null;
  let contactProperties:Record<string,string|null|undefined>={email:recipientEmail,firstname:nameArg.trim().split(/\s+/)[0]??""};
  if (liveCrm) {
    const contact=await readVerifiedDemoContact(hubspotContactId,recipientEmail);
    hubspotProperties=contact.crmProperties;
    contactProperties=contact.templateProperties;
    hubspotReadStatus = "verified";
  }

  // Clear prior runs for this email so demo runs clean
  for (const r of store.list()) {
    if (
      r.prospect.email.toLowerCase() === recipientEmail &&
      !["suppressed", "failed", "booked"].includes(r.status)
    ) {
      r.status = "failed";
      r.issue = "Superceded by fresh interactive demo run";
      r.revision += 1;
      store.cancel(r.id);
      store.save(r);
    }
  }

  const modelAdapter = useLiveModel ? new ConfigurableModel() : new FixtureModel();
  const engine = new OutreachEngine(store, modelAdapter);

  // The live auto-reply path is enabled only for the explicitly configured
  // HubSpot test contact. Other demo recipients stay operator-reviewed.
  const controlledAutoReply = liveSend &&
    recipientEmail.toLowerCase() === process.env.HUBSPOT_TEST_CONTACT_EMAIL?.toLowerCase().trim() &&
    hubspotContactId === process.env.HUBSPOT_TEST_CONTACT_ID?.trim();

  // Step 1: Initialize Sandbox Lead
  let run = engine.createSandbox({
    id: `lead-${hubspotContactId}`,
    name: nameArg,
    email: recipientEmail,
    permission: "granted",
    subscriberType: "individual",
    jurisdiction: "UK",
    lawfulBasis: "consent",
    facts: [
      { text: `${nameArg} is reviewing private market opportunities across approved sectors.`, source: "hubspot-dossier" },
      { text: "Approved operating sectors: managed funds, private equity, precious metals.", source: "asp-policy" },
    ],
    dossier: `${nameArg} is an active private investor reviewing macroeconomic allocations across managed funds, private equity, and precious metals.`,
  }, "human");
  if (options.replyHtmlTemplate !== undefined) saveReplyTemplate(store,"demo",options.replyHtmlTemplate);
  store.setSetting("reply-html-template:"+run.id,readReplyTemplate(store,"demo").template);

  run = await advanceRunUntil(engine, store, run.id, ["awaiting_approval"]);
  if (run.status !== "awaiting_approval") {
    throw new Error(`Initial drafting failed: status=${run.status} (${run.issue ?? "none"})`);
  }

  // Apply operator-configured first outbound message to the draft
  const targetSubject = (options.customSubject || run.draft?.subject || "Your private-market interests").trim();
  let targetBody = (options.customBody || run.draft?.body || DEFAULT_FIRST_MESSAGE).trim();
  const campaignPreferences=new CampaignRegistry(store).preferences();
  const templateFields=openingMessageFieldsFromText(nameArg,run.prospect.dossier??"",{
    senderName:process.env.CTX_SENDER_NAME,
    senderEmail:process.env.GMAIL_USER,
    standardFooter:campaignPreferences.standardFooter,
    contactProperties,
  });
  const renderedMessage=interpolateOpeningMessage(targetBody,templateFields);
  if(renderedMessage.missing.length)throw new Error(`Opening message has unresolved fields: ${renderedMessage.missing.join(", ")}. Sync the contact or configure the campaign footer, then retry.`);
  targetBody=renderedMessage.text;
  if (!/stop|opt.out|unsubscribe|no further emails/i.test(targetBody)) {
    targetBody += "\n\nReply stop if you would prefer no further contact.";
  }
  if (!targetBody.includes("ASP Private Capital")) {
    targetBody += "\nASP Private Capital";
  }

  engine.edit(run.id, {
    subject: targetSubject,
    body: targetBody,
  });
  run = await advanceRunUntil(engine, store, run.id, ["awaiting_approval"]);

  if (run.status !== "awaiting_approval" || !run.draft) {
    throw new Error(`Initial drafting failed: status=${run.status} (${run.issue ?? "none"})`);
  }

  const initialDraft = run.draft;

  // Step 2: Operator Approves Draft
  engine.approve(run.id, initialDraft.hash, "operator-dylan");
  run = await advanceRunUntil(engine, store, run.id, ["waiting_reply"]);
  if (run.status !== "waiting_reply") {
    throw new Error(`Initial dispatch preparation failed: status=${run.status} (${run.issue ?? "none"})`);
  }
  // Enable listener auto-reply only after the initial message has passed
  // review, received explicit approval, and entered the live reply state.
  run.mode = controlledAutoReply ? "automatic" : "human";
  store.save(run);

  let sendResult: { sent: boolean; messageId?: string; error?: string } = { sent: false };
  let emailLogStatus: string | null = null;
  let propertyUpdateStatus: string | null = null;

  // Step 3: Dispatch Email & Update HubSpot
  if (liveSend) {
    sendResult = await sendLiveOutreachEmail({
      to: recipientEmail,
      subject: initialDraft.subject,
      text: initialDraft.body,
      runId: run.id,
      phase1LeadId: `lead-${hubspotContactId}`,
      isTestRecipient: true,
    });

    if (!sendResult.sent) {
      throw new Error(`Live email delivery failed: ${sendResult.error}`);
    }
    try {
      store.recordEmailDelivery(run.id, `${run.id}:${initialDraft.version}`, {
        from: process.env.GMAIL_USER ?? "",
        fromName: process.env.CTX_SENDER_NAME ?? "Dylan (ASP Private Capital)",
        to: recipientEmail,
        subject: initialDraft.subject,
        sentAt: new Date().toISOString(),
        externalMessageId: sendResult.messageId ?? `email-${run.id}-${initialDraft.version}`,
      });
    } catch {
      store.event(run.id,"delivery_metadata_warning",{message:"Email was accepted by SMTP, but the transcript address metadata could not be updated."});
    }

    if (liveCrm) {
      const emailLog = await getHubSpotGateway().logEmailEngagement({
        hubspotId: hubspotContactId,
        email: recipientEmail,
        messageId: sendResult.messageId ?? `msg-${Date.now()}`,
        approvedBy: "operator-dylan",
        subject: initialDraft.subject,
        bodyText: initialDraft.body,
        sentAt: new Date().toISOString(),
        threadId: run.id,
      });
      emailLogStatus = emailLog.status;

      const statusUpdate = await getHubSpotGateway().updateOutreachStatus({
        hubspotId: hubspotContactId,
        email: recipientEmail,
        messageId: `${sendResult.messageId}:status`,
        approvedBy: "operator-dylan",
        properties: {
          ctx_status: "Dispatched",
          ctx_last_contact: new Date().toISOString(),
          ctx_booking_link_sent: initialDraft.body.includes("cal.com"),
        },
      });
      propertyUpdateStatus = statusUpdate.status;
      try {hubspotProperties=(await readVerifiedDemoContact(hubspotContactId,recipientEmail)).crmProperties;hubspotReadStatus="verified after write";} catch {hubspotReadStatus="readback failed";}
    }
  }

  return {
    ok: true,
    runId: run.id,
    run: store.get(run.id),
    draft: initialDraft,
    sendResult,
    emailLogStatus,
    propertyUpdateStatus,
    hubspotReadStatus,
    hubspotProperties,
    createdAt: Date.now(),
  };
}

export async function checkInboundDemoReply(runId: string, options?: { liveSend?: boolean; liveCrm?: boolean }) {
  const store = outreachStore();
  let run = store.get(runId);
  if (!run) throw new Error("Workflow run not found.");

  const recipientEmail = run.prospect.email.toLowerCase().trim();
  const hubspotContactId = (run.prospect.phase1LeadId ?? run.prospect.id).replace(/^lead-/, "");
  const liveSend = options?.liveSend ?? (process.env.CTX_LIVE_EMAIL_DISPATCH === "true");
  const liveCrm = options?.liveCrm ?? (process.env.HUBSPOT_WRITES_ENABLED === "true");

  // Min date: from outbound dispatch event
  const outboundEvent = store.events(run.id).find((e) => e.kind === "approved" || e.kind === "step_finished");
  const minDate = outboundEvent ? new Date(outboundEvent.at - 60000) : new Date(Date.now() - 3600000);

  const baselineUids = new Set<number>();
  const inbound = await fetchLatestInboundReply({
    prospectEmail: recipientEmail,
    processedUids: baselineUids,
    checkpoint:JSON.parse(String(store.setting("imap-checkpoint:"+recipientEmail)??"null"))??undefined,
    minDate,
  });

  if (!inbound || !inbound.text.trim()) {
    return { ok: true, detected: false, message: "No new inbound reply found in inbox yet." };
  }

  // Feed reply into engine
  const engine = new OutreachEngine(store, run.inference === "live" ? new ConfigurableModel() : new FixtureModel());
  const accepted = engine.reply(run.id, inboundReplyEventId(inbound.uid,inbound.mailboxId), inbound.text, {from:inbound.from,fromName:inbound.fromName,to:process.env.GMAIL_USER,subject:inbound.subject,sentAt:inbound.date.toISOString(),externalMessageId:inbound.messageId});
  if (!accepted) return { ok: true, detected: true, alreadyProcessed: true, message: "This mailbox reply was already processed.", run: store.get(run.id) };
  await drainEngine(engine);
  run = store.get(run.id);

  let hubspotReplyLogStatus: string | null = null;
  let hubspotReplyPropertyStatus: string | null = null;
  let hubspotBriefingNoteStatus: string | null = null;
  if (liveCrm) {
    const gateway = getHubSpotGateway();
    const replyLog = await gateway.logReplyEngagement({
      hubspotId: hubspotContactId,
      email: recipientEmail,
      messageId: `reply-imap-${inbound.uid}`,
      sentiment: run.classification === "booking" ? "Booking Request" : "Interested",
      replyText: inbound.text,
      replyAt: inbound.date.toISOString(),
      threadId: run.id,
    });
    hubspotReplyLogStatus = replyLog.status;

    // 2. Update CRM status to "Replied" (ctx_status is NOT Booked until calendar meeting is confirmed)
    const replyStatus = await gateway.updateOutreachStatus({
      hubspotId: hubspotContactId,
      email: recipientEmail,
      messageId: `reply-status-imap-${inbound.uid}`,
      approvedBy: "conversation_agent",
      properties: {
        ctx_status: run.classification === "opt_out" ? "Opted Out" : "Replied",
        ctx_last_contact: new Date().toISOString(),
        ctx_booking_link_sent: false,
      },
    });
    hubspotReplyPropertyStatus = replyStatus.status;
    const briefing = await gateway.logBrokerBriefingNote({
      hubspotId: hubspotContactId,
      email: recipientEmail,
      messageId: `reply-imap-${inbound.uid}:broker-brief`,
      stage: run.classification ?? "Reply received",
      prospectQuote: inbound.text,
      agentBrief: run.brief?.summary ?? "Inbound reply classified and added to the CTX conversation.",
      talkingPoints: ["Confirm the prospect’s stated objective.", "Use only approved, evidence-backed information.", "Keep ASP’s introducer and liaison role clear."],
    });
    hubspotBriefingNoteStatus = briefing.status;
  }

  // Auto-approve reply draft and dispatch follow-up with Cal.com booking link if ready
  await drainEngine(engine);
  run = store.get(run.id);

  let replySent = false;
  let hubspotAgentReplyLogStatus: string | null = null;
  let hubspotAgentReplyPropertyStatus: string | null = null;
  let hubspotProperties: HubSpotDemoProperties | null = null;
  if (liveSend && run.status === "awaiting_approval" && run.draft) {
    const replyDraft = run.draft;
    engine.approve(run.id, replyDraft.hash, "operator-dylan");
    await drainEngine(engine);
    run = store.get(run.id);

    if (liveSend) {
      const res = await sendLiveOutreachEmail({
        to: recipientEmail,
        subject: replyDraft.subject,
        text: replyDraft.body,
        intent: "reply",
        htmlTemplate: String(store.setting("reply-html-template:"+run.id) ?? store.setting("reply-html-template") ?? process.env.CTX_REPLY_HTML_TEMPLATE ?? ""),
        runId: run.id,
        phase1LeadId: `lead-${hubspotContactId}`,
        isTestRecipient: true,
      });
      replySent = res.sent;
      if (res.sent) {
        try {
          store.recordEmailDelivery(run.id, `${run.id}:${replyDraft.version}`, {
            from: process.env.GMAIL_USER ?? "",
            fromName: process.env.CTX_SENDER_NAME ?? "Dylan (ASP Private Capital)",
            to: recipientEmail,
            subject: replyDraft.subject,
            sentAt: new Date().toISOString(),
            externalMessageId: res.messageId ?? `email-${run.id}-${replyDraft.version}`,
          });
        } catch {
          store.event(run.id,"delivery_metadata_warning",{message:"Agent email was accepted by SMTP, but the transcript address metadata could not be updated."});
        }
      }

      if (liveCrm && res.sent) {
        const gateway = getHubSpotGateway();
        const replyEmailLog = await gateway.logEmailEngagement({
          hubspotId: hubspotContactId,
          email: recipientEmail,
          messageId: res.messageId ?? `agent-reply-${Date.now()}`,
          approvedBy: "operator-dylan",
          subject: replyDraft.subject,
          bodyText: replyDraft.body,
          sentAt: new Date().toISOString(),
          threadId: run.id,
        });
        hubspotAgentReplyLogStatus = replyEmailLog.status;
        const replyStatus = await gateway.updateOutreachStatus({
          hubspotId: hubspotContactId,
          email: recipientEmail,
          messageId: `${res.messageId ?? `agent-reply-${Date.now()}`}:status`,
          approvedBy: "operator-dylan",
          properties: {
            ctx_status: run.classification === "opt_out" ? "Opted Out" : "Replied",
            ctx_last_contact: new Date().toISOString(),
            ctx_booking_link_sent: replyDraft.body.includes("cal.com"),
          },
        });
        hubspotAgentReplyPropertyStatus = replyStatus.status;
        try {hubspotProperties=(await readVerifiedDemoContact(hubspotContactId,recipientEmail)).crmProperties;} catch {hubspotProperties=null;}
      }
    }
  }

  return {
    ok: true,
    detected: true,
    inboundReply: {
      from: inbound.from,
      subject: inbound.subject,
      text: inbound.text,
      date: inbound.date.toISOString(),
    },
    classification: run.classification ?? "general",
    hubspotReplyLogStatus,
    hubspotReplyPropertyStatus,
    hubspotBriefingNoteStatus,
    hubspotAgentReplyLogStatus,
    hubspotAgentReplyPropertyStatus,
    hubspotProperties,
    replySent,
    run: store.get(run.id),
  };
}

export async function simulateInboundDemoReply(
  runId: string,
  replyText: string,
  options?: { liveSend?: boolean; liveCrm?: boolean }
) {
  const store = outreachStore();
  let run = store.get(runId);
  if (!run) throw new Error("Workflow run not found.");

  const recipientEmail = run.prospect.email.toLowerCase().trim();
  const hubspotContactId = (run.prospect.phase1LeadId ?? run.prospect.id).replace(/^lead-/, "");
  const liveSend = options?.liveSend ?? (process.env.CTX_LIVE_EMAIL_DISPATCH === "true");
  const liveCrm = options?.liveCrm ?? (process.env.HUBSPOT_WRITES_ENABLED === "true");

  const engine = new OutreachEngine(store, run.inference === "live" ? new ConfigurableModel() : new FixtureModel());
  const eventId = `reply-sim-${Date.now()}`;
  engine.reply(run.id, eventId, replyText);
  await drainEngine(engine);
  run = store.get(run.id);

  let hubspotRepliedUpdated = false;
  if (liveCrm) {
    // 1. Log inbound reply engagement to HubSpot Timeline
    await getHubSpotGateway().logReplyEngagement({
      hubspotId: hubspotContactId,
      email: recipientEmail,
      messageId: `reply-inbound-sim-${Date.now()}`,
      sentiment: run.classification === "booking" ? "Booking Request" : "Interested",
      replyText,
      replyAt: new Date().toISOString(),
      threadId: run.id,
    }).catch(() => {});

    // 2. Update CRM status to "Replied" (ctx_status is NOT Booked until calendar meeting is confirmed)
    await getHubSpotGateway().updateOutreachStatus({
      hubspotId: hubspotContactId,
      email: recipientEmail,
      messageId: `reply-status-sim-${Date.now()}`,
      approvedBy: "conversation_agent",
      properties: {
        ctx_status: run.classification === "opt_out" ? "Opted Out" : "Replied",
        ctx_last_contact: new Date().toISOString(),
        ctx_booking_link_sent: run.classification === "booking",
      },
    }).then(() => { hubspotRepliedUpdated = true; }).catch(() => {});
  }

  // Auto-approve reply draft and dispatch follow-up with Cal.com booking link if ready
  await drainEngine(engine);
  run = store.get(run.id);

  let replySent = false;
  if (liveSend && run.status === "awaiting_approval" && run.draft) {
    const replyDraft = run.draft;
    engine.approve(run.id, replyDraft.hash, "operator-dylan");
    await drainEngine(engine);
    run = store.get(run.id);

    if (liveSend) {
      const res = await sendLiveOutreachEmail({
        to: recipientEmail,
        subject: replyDraft.subject,
        text: replyDraft.body,
        intent: "reply",
        htmlTemplate: String(store.setting("reply-html-template:"+run.id) ?? store.setting("reply-html-template") ?? process.env.CTX_REPLY_HTML_TEMPLATE ?? ""),
        runId: run.id,
        phase1LeadId: `lead-${hubspotContactId}`,
        isTestRecipient: true,
      });
      replySent = res.sent;
      if (res.sent) {
        try {
          store.recordEmailDelivery(run.id, `${run.id}:${replyDraft.version}`, {
            from: process.env.GMAIL_USER ?? "",
            fromName: process.env.CTX_SENDER_NAME ?? "Dylan (ASP Private Capital)",
            to: recipientEmail,
            subject: replyDraft.subject,
            sentAt: new Date().toISOString(),
            externalMessageId: res.messageId ?? `email-${run.id}-${replyDraft.version}`,
          });
        } catch {
          store.event(run.id,"delivery_metadata_warning",{message:"Agent email was accepted by SMTP, but the transcript address metadata could not be updated."});
        }
      }

      if (liveCrm && res.sent) {
        await getHubSpotGateway().logEmailEngagement({
          hubspotId: hubspotContactId,
          email: recipientEmail,
          messageId: res.messageId ?? `agent-reply-sim-${Date.now()}`,
          approvedBy: "operator-dylan",
          subject: replyDraft.subject,
          bodyText: replyDraft.body,
          sentAt: new Date().toISOString(),
          threadId: run.id,
        }).catch(() => {});
      }
    }
  }

  return {
    ok: true,
    detected: true,
    simulated: true,
    inboundReply: {
      from: recipientEmail,
      subject: `Re: ${run.draft?.subject ?? "Your private-market interests"}`,
      text: replyText,
      date: new Date().toISOString(),
    },
    classification: run.classification ?? "general",
    hubspotRepliedUpdated,
    replySent,
    run: store.get(run.id),
  };
}

/**
 * Confirms an actual Google Calendar / Cal.com meeting booking.
 * Only this transition sets ctx_status to "Booked" in HubSpot.
 */
export async function confirmMeetingBooking(runId: string, options?: { startsAt?: string; liveCrm?: boolean }) {
  // Confirmation is read from verified booking state, never fabricated locally.
  const result = await getDemoRunStatus(runId, options?.liveCrm ?? false);
  return {...result, status:result.run.status};
}
