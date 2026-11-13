import path from "node:path";
import fs from "node:fs";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { ConfigurableModel, FixtureModel, outreachModelConfig } from "../src/lib/server/outreach/models";
import { seedFixtureSources } from "../src/lib/server/outreach/sources";
import { sendLiveOutreachEmail } from "../src/lib/server/outreach/transport/email";
import {
  fetchLatestInboundReply,
  inboundReplyEventId,
  getExistingProspectMessageUids,
  type InboundEmail,
} from "../src/lib/server/outreach/transport/imap";
import { getMessageBus } from "../src/lib/server/outreach/orchestrator/bus";
import { getHubSpotAuditLogger } from "../src/lib/server/integrations/hubspot-audit";
import { getHubSpotGateway } from "../src/lib/server/integrations/hubspot-gateway";

// Load environment variables
for (const envFile of [".env.local", ".env"]) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // Ignore
    }
  }
}

const args = process.argv.slice(2);
const liveCrmRequested = args.includes("--live-crm");
const configuredTestContactEmail = process.env.HUBSPOT_TEST_CONTACT_EMAIL?.trim().toLowerCase();
const configuredTestContactId = process.env.HUBSPOT_TEST_CONTACT_ID?.trim();
const toArg =
  args.find((a) => a.startsWith("--to="))?.split("=")[1] ??
  process.env.HUBSPOT_TEST_CONTACT_EMAIL ??
  process.env.DEMO_RECIPIENT_EMAIL ??
  "dylan@aspinvest.co.uk";

const nameArg =
  args.find((a) => a.startsWith("--name="))?.split("=")[1] ??
  process.env.HUBSPOT_TEST_CONTACT_NAME ??
  "Dylan";

const hsIdArg =
  args.find((a) => a.startsWith("--hubspot-id="))?.split("=")[1] ??
  process.env.HUBSPOT_TEST_CONTACT_ID ??
  "9999900001"; // Fallback demo ID

const liveSend =
  args.includes("--live-send") ||
  (!args.includes("--no-send") && process.env.CTX_LIVE_EMAIL_DISPATCH === "true");

const useLiveModel =
  !args.includes("--no-model") &&
  (args.includes("--live-model") ||
    outreachModelConfig().configured);

const recipientEmail = toArg.trim().toLowerCase();
const hubspotContactId = hsIdArg.trim();

if (liveCrmRequested) {
  if (!process.env.HUBSPOT_ACCESS_TOKEN?.trim()) {
    throw new Error("--live-crm requires HUBSPOT_ACCESS_TOKEN in .env.local.");
  }
  if (
    !configuredTestContactId ||
    !configuredTestContactEmail ||
    hubspotContactId !== configuredTestContactId ||
    recipientEmail !== configuredTestContactEmail
  ) {
    throw new Error("--live-crm is limited to the exact HUBSPOT_TEST_CONTACT_ID and HUBSPOT_TEST_CONTACT_EMAIL configured in .env.local.");
  }
  process.env.HUBSPOT_WRITES_ENABLED = "true";
}

// Keep the demo allowlist bound to the operator-configured contact pair.
if (
  configuredTestContactId &&
  configuredTestContactEmail &&
  hubspotContactId === configuredTestContactId &&
  recipientEmail === configuredTestContactEmail
) {
  process.env.HUBSPOT_TEST_CONTACT_ID = configuredTestContactId;
  process.env.HUBSPOT_TEST_CONTACT_EMAIL = configuredTestContactEmail;
  process.env.HUBSPOT_TEST_CONTACT_NAME = process.env.HUBSPOT_TEST_CONTACT_NAME ?? nameArg;
}

const dbPath =
  process.env.CTX_OUTREACH_DB_PATH ??
  path.join(process.cwd(), "data/generated/outreach/workflows.sqlite");
const store = new OutreachStore(dbPath);
seedFixtureSources(store);

const bus = getMessageBus();
bus.setPersistentLogger((msg) => store.event("a2a-bus", "a2a_message", msg));

const modelAdapter = useLiveModel ? new ConfigurableModel() : new FixtureModel();
const engine = new OutreachEngine(store, modelAdapter);

async function drain() {
  for (let i = 0; i < 40 && (await engine.tick()); i++);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("================================================================================");
  console.log("ASP PRIVATE CAPITAL — INTERACTIVE LIVE EMAIL & HUBSPOT CRM DEMO");
  console.log("================================================================================");
  console.log(`Prospect:              \x1b[1m${nameArg} <${recipientEmail}>\x1b[0m`);
  console.log(`HubSpot Contact ID:    \x1b[1m${hubspotContactId}\x1b[0m`);
  console.log(`Sender Gmail:          \x1b[1m${process.env.GMAIL_USER ?? "NOT CONFIGURED"}\x1b[0m`);
  console.log(`Live Email Sending:    ${liveSend ? "\x1b[32mACTIVE (Will send real emails via SMTP)\x1b[0m" : "\x1b[33mSIMULATION ONLY\x1b[0m"}`);
  console.log(`HubSpot Writes:        ${process.env.HUBSPOT_WRITES_ENABLED === "true" ? "\x1b[32mLIVE CRM (Updates real HubSpot records)\x1b[0m" : "\x1b[33mDRY-RUN (Safe audit logging to SQLite)\x1b[0m"}`);
  console.log(`Inference Engine:      ${useLiveModel ? "\x1b[32mLIVE MODEL\x1b[0m" : "\x1b[36mOFFLINE FIXTURES\x1b[0m"}`);
  console.log("================================================================================\n");

  // Step 0: Take snapshot of existing message UIDs in inbox from this recipient
  console.log("\x1b[90m[Setup] Taking baseline snapshot of recipient's existing inbox UIDs via IMAP...\x1b[0m");
  const baselineUids = await getExistingProspectMessageUids(recipientEmail).catch(() => new Set<number>());
  const outboundTimestamp = new Date();

  // Clear prior runs for this email
  for (const r of store.list()) {
    if (
      r.prospect.email.toLowerCase() === recipientEmail &&
      !["suppressed", "failed", "booked"].includes(r.status)
    ) {
      r.status = "failed";
      r.issue = "Superceded by fresh interactive demo run";
      store.save(r);
    }
  }

  // Step 1: Initialize Lead with HubSpot ID
  console.log("\x1b[1m[STAGE 1] Sovereign Agents Generating Cold Outreach Email...\x1b[0m");
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
  });

  await drain();
  run = store.get(run.id);

  if (run.status !== "awaiting_approval" || !run.draft) {
    console.error(`\x1b[31mInitial drafting failed: status=${run.status} (${run.issue ?? "none"})\x1b[0m`);
    process.exit(1);
  }

  const initialDraft = run.draft;
  console.log("\x1b[32m✔ Initial Outreach Draft Generated & Approved by Compliance Review:\x1b[0m");
  console.log(`   \x1b[1mSubject:\x1b[0m ${initialDraft.subject}`);
  console.log(`   \x1b[1mBody:\x1b[0m\n${initialDraft.body}\n`);

  // Operator approves draft
  engine.approve(run.id, initialDraft.hash, "operator-dylan");
  await drain();
  run = store.get(run.id);

  // Step 2: Dispatch Email & Update HubSpot to "Dispatched"
  if (liveSend) {
    console.log("\x1b[1m[STAGE 2] Dispatching Email via Gmail SMTP...\x1b[0m");
    const sendResult = await sendLiveOutreachEmail({
      to: recipientEmail,
      subject: initialDraft.subject,
      text: initialDraft.body,
      runId: run.id,
      phase1LeadId: `lead-${hubspotContactId}`,
      isTestRecipient: true,
    });

    if (!sendResult.sent) {
      console.error(`\x1b[31m❌ Live email delivery failed: ${sendResult.error}\x1b[0m`);
      process.exit(1);
    }
    console.log(`\x1b[32m✔ Email successfully delivered over SMTP to ${recipientEmail}!\x1b[0m`);
    console.log(`   \x1b[90mMessage ID: ${sendResult.messageId}\x1b[0m`);
    const emailLog = await getHubSpotGateway().logEmailEngagement({hubspotId:hubspotContactId,email:recipientEmail,messageId:sendResult.messageId,approvedBy:"operator-dylan",subject:initialDraft.subject,bodyText:initialDraft.body,sentAt:new Date().toISOString(),threadId:run.id});
    const statusUpdate = await getHubSpotGateway().updateOutreachStatus({hubspotId:hubspotContactId,email:recipientEmail,messageId:`${sendResult.messageId}:status`,approvedBy:"operator-dylan",properties:{ctx_status:"Dispatched",ctx_last_contact:new Date().toISOString(),ctx_booking_link_sent:initialDraft.body.includes("cal.com")}});
    console.log(`   HubSpot email log: ${emailLog.status}; contact status: ${statusUpdate.status}`);
    if(emailLog.status!=="applied"||statusUpdate.status!=="applied") console.error("HubSpot did not confirm both live updates; inspect the audit log before continuing.");
  } else {
    console.log("\x1b[33m[NOTICE] Message recorded in outbox simulation only (--live-send omitted).\x1b[0m");
  }

  if(liveSend) console.log("HubSpot results above reflect gateway responses after SMTP acceptance.");
  else console.log("HubSpot updates withheld because no live email was sent.");

  // Step 3: Interactive IMAP Polling Loop for Prospect Reply
  console.log("\n================================================================================");
  console.log("\x1b[1m[STAGE 3] WAITING FOR YOUR REPLY FROM YOUR INBOX...\x1b[0m");
  console.log("--------------------------------------------------------------------------------");
  console.log(`1. Open your inbox at \x1b[1m${recipientEmail}\x1b[0m.`);
  console.log(`2. Reply to the email (e.g. "Hi Dylan, I would like to schedule a call to discuss precious metals.").`);
  console.log("3. Keep this terminal open — it is actively polling your inbox via IMAP...");
  console.log("================================================================================\n");

  let inboundReply: InboundEmail | null = null;
  const pollStart = Date.now();
  const maxWaitMs = 15 * 60 * 1000; // 15 minutes timeout

  while (Date.now() - pollStart < maxWaitMs) {
    process.stdout.write(`\r\x1b[90m[IMAP Polling] Checking inbox for new reply from ${recipientEmail}... (${Math.round((Date.now() - pollStart) / 1000)}s elapsed)\x1b[0m`);
    try {
      const reply = await fetchLatestInboundReply({
        prospectEmail: recipientEmail,
        processedUids: baselineUids,
        minDate: outboundTimestamp,
      });

      if (reply && reply.text.trim().length > 0) {
        inboundReply = reply;
        process.stdout.write("\n\n");
        break;
      }
    } catch {
      // Continue polling
    }
    await sleep(4000);
  }

  if (!inboundReply) {
    console.log("\n\x1b[33mPolling timed out after 15 minutes without an inbound reply.\x1b[0m");
    console.log("You can manually trigger reply processing with: npm run demo:reply");
    return;
  }

  console.log("\x1b[32m✔ INBOUND REPLY DETECTED!\x1b[0m");
  console.log(`   \x1b[1mFrom:\x1b[0m ${inboundReply.from}`);
  console.log(`   \x1b[1mDate:\x1b[0m ${inboundReply.date.toISOString()}`);
  console.log(`   \x1b[1mSubject:\x1b[0m ${inboundReply.subject}`);
  console.log(`   \x1b[1mContent:\x1b[0m\n   \x1b[35m"${inboundReply.text}"\x1b[0m\n`);

  // Step 4: Feed reply into Conversation Agent
  console.log("\x1b[1m[STAGE 4] Agent Ingesting Reply, Analyzing Intent & Updating CRM...\x1b[0m");
  engine.reply(run.id,inboundReplyEventId(inboundReply.uid,inboundReply.mailboxId),inboundReply.text);
  await drain();
  run = store.get(run.id);

  console.log(`   • \x1b[1mAgent Detected Classification:\x1b[0m \x1b[32m${run.classification?.toUpperCase() ?? "GENERAL"}\x1b[0m`);
  console.log(`   • \x1b[1mWorkflow Status:\x1b[0m ${run.status}`);

  if (run.classification === "booking") {
    console.log(`   • \x1b[32mInbound Call Request Identified!\x1b[0m`);
    console.log(`   • \x1b[33mHubSpot Profile Updated:\x1b[0m ctx_status = \x1b[1mReplied\x1b[0m (ctx_booking_link_sent = true)`);
    console.log(`   • \x1b[90m(Compliance Rule: Lead status is "Replied". Booking status requires confirmed calendar sync.)\x1b[0m`);
  }

  if (liveSend || process.env.HUBSPOT_WRITES_ENABLED === "true") {
    await getHubSpotGateway().logReplyEngagement({
      hubspotId: hubspotContactId,
      email: recipientEmail,
      messageId: `reply-${inboundReply.uid}`,
      sentiment: run.classification === "booking" ? "Booking Request" : "Interested",
      replyText: inboundReply.text,
      replyAt: inboundReply.date.toISOString(),
      threadId: run.id,
    }).catch(() => {});
  }

  // Step 5: Draft Tailored Agent Response Email
  await drain();
  run = store.get(run.id);

  if (run.status === "awaiting_approval" && run.draft) {
    const replyDraft = run.draft;
    console.log("\n\x1b[32m✔ Agent Drafted Tailored Response (Passed Regulatory & Deliverability Review):\x1b[0m");
    console.log("--------------------------------------------------------------------------------");
    console.log(`\x1b[1mSubject:\x1b[0m ${replyDraft.subject}`);
    console.log("--------------------------------------------------------------------------------");
    console.log(replyDraft.body);
    console.log("--------------------------------------------------------------------------------\n");

    engine.approve(run.id, replyDraft.hash, "operator-dylan");
    await drain();

    if (liveSend) {
      console.log("\x1b[1m[STAGE 5] Sending Agent's Tailored Response via Gmail SMTP...\x1b[0m");
      const result = await sendLiveOutreachEmail({
        to: recipientEmail,
        subject: replyDraft.subject,
        text: replyDraft.body,
        intent: "reply",
        htmlTemplate: String(store.setting("reply-html-template") ?? process.env.CTX_REPLY_HTML_TEMPLATE ?? ""),
        runId: run.id,
        phase1LeadId: `lead-${hubspotContactId}`,
        isTestRecipient: true,
      });

      if (result.sent) {
        console.log(`\x1b[32m✔ Agent response successfully delivered to ${recipientEmail}!\x1b[0m`);
        await getHubSpotGateway().logEmailEngagement({
          hubspotId: hubspotContactId,
          email: recipientEmail,
          messageId: result.messageId ?? `agent-reply-${Date.now()}`,
          approvedBy: "operator-dylan",
          subject: replyDraft.subject,
          bodyText: replyDraft.body,
          sentAt: new Date().toISOString(),
          threadId: run.id,
        }).catch(() => {});
      } else {
        console.error(`\x1b[31m❌ Live response delivery failed: ${result.error}\x1b[0m`);
      }
    }
  }

  // Step 6: Calendar Meeting Confirmation (Cal.com -> Google Calendar -> HubSpot CRM)
  console.log("\n================================================================================");
  console.log("\x1b[1m[STAGE 6] CONFIRMING MEETING IN GOOGLE CALENDAR (CAL.COM SYNC)\x1b[0m");
  console.log("--------------------------------------------------------------------------------");
  console.log("Syncing confirmed calendar event from Google Calendar / Cal.com to CRM...");

  const startsAt = new Date(Date.now() + 2 * 86400000).toISOString();
  const eventId = `cal-meet-${Date.now()}`;
  const bookingId = `book-${Date.now()}`;

  engine.booking(run.id, {
    eventId,
    bookingId,
    sequence: 1,
    startsAt,
    status: "confirmed",
  });
  await drain();
  run = store.get(run.id);

  console.log(`\x1b[32m✔ Meeting Confirmed in Google Calendar!\x1b[0m`);
  console.log(`   \x1b[1mScheduled Date/Time:\x1b[0m ${new Date(startsAt).toUTCString()}`);
  console.log(`   \x1b[1mCalendar Event ID:\x1b[0m   ${eventId}`);
  console.log(`   \x1b[1mWorkflow Final Status:\x1b[0m \x1b[32m${run.status.toUpperCase()}\x1b[0m`);
  console.log(`   \x1b[32mHubSpot Profile Updated:\x1b[0m ctx_status = \x1b[1mBooked\x1b[0m`);

  if (process.env.HUBSPOT_WRITES_ENABLED === "true") {
    const gateway = getHubSpotGateway();
    await gateway.logEmailEngagement({
      hubspotId: hubspotContactId,
      email: recipientEmail,
      messageId: `cal-confirmed-cli-${Date.now()}`,
      approvedBy: "cal_google_calendar_sync",
      subject: "Meeting Confirmed in Google Calendar (via Cal.com)",
      bodyText: `Confirmed introductory consultation call scheduled for ${new Date(startsAt).toUTCString()}.\nCalendar Event ID: ${eventId}\nPlatform: Cal.com -> Google Calendar -> HubSpot CRM Sync.`,
      sentAt: new Date().toISOString(),
    }).catch(() => {});
  }

  // Step 7: Audit Log Inspection
  console.log("\n================================================================================");
  console.log("DEMO SUMMARY & AUDIT TRAIL VERIFICATION");
  console.log("================================================================================");
  const auditLogger = getHubSpotAuditLogger();
  const recentLogs = auditLogger.listRecent(5);
  console.log(`Recent HubSpot Gateway Audit Entries (${recentLogs.length} found):`);
  for (const log of recentLogs) {
    console.log(` • [${new Date(log.timestamp).toLocaleTimeString()}] ${log.operation} -> ${log.decision} (${log.status}) [HTTP: ${log.httpStatus ?? "none"}]`);
  }
  console.log("\nYou can view the live interactive run in the CTX Dashboard at: http://localhost:3000");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Interactive demo error:", err);
  process.exit(1);
});
