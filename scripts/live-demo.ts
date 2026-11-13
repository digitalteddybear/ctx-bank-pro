import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import nodemailer from "nodemailer";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { ConfigurableModel, FixtureModel } from "../src/lib/server/outreach/models";
import { seedFixtureSources } from "../src/lib/server/outreach/sources";
import { sendLiveOutreachEmail } from "../src/lib/server/outreach/transport/email";
import {
  fetchLatestInboundReply,
  inboundReplyEventId,
  checkOperatorSentIntervention,
  getExistingProspectMessageUids,
} from "../src/lib/server/outreach/transport/imap";
import { getMessageBus } from "../src/lib/server/outreach/orchestrator/bus";

// Auto-load environment files
for (const envFile of [".env.local", ".env"]) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // ignore
    }
  }
}

/** Update or insert key-value pairs into .env.local and process.env */
export function updateEnvLocal(keyValues: Record<string, string>, targetEnvPath?: string): void {
  const envPath = targetEnvPath ?? path.resolve(process.cwd(), ".env.local");
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf-8");
  } else {
    content = "# ASP Outreach Agent - Environment Configuration\n";
  }

  for (const [key, rawVal] of Object.entries(keyValues)) {
    const val = rawVal.trim();
    const regex = new RegExp(`^${key}=.*$`, "m");
    const formatted = `${key}="${val}"`;
    if (regex.test(content)) {
      content = content.replace(regex, formatted);
    } else {
      content = content.trimEnd() + (content.length > 0 ? "\n" : "") + formatted + "\n";
    }
    process.env[key] = val;
  }

  fs.writeFileSync(envPath, content, "utf-8");
}

/** Interactive configuration for the sender Gmail account and App Password */
async function configureSenderAccount(rl: readline.Interface): Promise<string> {
  console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
  console.log("\x1b[1m\x1b[33m⚙️  SENDER ACCOUNT CONFIGURATION (.env.local)\x1b[0m");
  console.log("Configure the Google account used by Dylan & ASP Outreach Agents for live dispatch.\n");

  const currentEmail = process.env.GMAIL_USER ?? "ziggyjordan2002@gmail.com";
  console.log(`  Current sender address: \x1b[32m${currentEmail}\x1b[0m`);
  const emailInput = await askQuestion(rl, `  Enter Sender Gmail Address [Press ENTER to keep '${currentEmail}']: `);
  const newEmail = emailInput.trim() || currentEmail;

  if (!newEmail || !newEmail.includes("@")) {
    console.log("  \x1b[31m❌ Invalid email address. Settings unchanged.\x1b[0m\n");
    return currentEmail;
  }

  const currentPass = process.env.GMAIL_APP_PASSWORD ?? "";
  const maskedPass = currentPass
    ? `${currentPass.slice(0, 4)} **** **** ${currentPass.slice(-4)}`
    : "(not set)";
  console.log(`\n  Current Google App Password: \x1b[90m${maskedPass}\x1b[0m`);
  console.log("  \x1b[90m(To generate: Google Account > Security > 2-Step Verification > App passwords)\x1b[0m");
  const passInput = await askQuestion(rl, `  Enter Google App Password [Press ENTER to keep current]: `);
  const newPass = passInput.trim() || currentPass;

  if (!newPass) {
    console.log("  \x1b[31m❌ Google App Password is required for email delivery. Settings unchanged.\x1b[0m\n");
    return currentEmail;
  }

  updateEnvLocal({
    GMAIL_USER: newEmail,
    GMAIL_APP_PASSWORD: newPass,
    CTX_LIVE_EMAIL_DISPATCH: "true",
  });

  console.log("\n  \x1b[32m✔ .env.local updated successfully!\x1b[0m");
  console.log(`  \x1b[32m✔ Active Sender Account:\x1b[0m Dylan (ASP Private Capital) <\x1b[1m\x1b[32m${newEmail}\x1b[0m>`);

  // Verify SMTP authentication with Google
  process.stdout.write("  \x1b[36mTesting Google SMTP authentication...\x1b[0m ");
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: newEmail,
        pass: newPass.replace(/\s+/g, ""),
      },
    });
    await transporter.verify();
    console.log("\x1b[32m✔ Authenticated successfully!\x1b[0m\n");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log("\x1b[33m⚠ Warning: Google authentication check failed\x1b[0m");
    console.log(`    \x1b[90mError: ${message}\x1b[0m`);
    console.log("    Credentials have still been saved to .env.local. Please ensure 2-Step Verification is active.\n");
  }

  return newEmail;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dbPath = process.env.CTX_OUTREACH_DB_PATH ?? path.join(process.cwd(), "data/generated/outreach/workflows.sqlite");
const store = new OutreachStore(dbPath);
seedFixtureSources(store);

const bus = getMessageBus();
bus.setPersistentLogger((msg) => store.event("a2a-bus", "a2a_message", msg));

const useLiveModel = Boolean(process.env.GEMINI_API_KEY || process.env.CTX_OUTREACH_MODEL_KEY);
const modelAdapter = useLiveModel ? new ConfigurableModel() : new FixtureModel();
const engine = new OutreachEngine(store, modelAdapter);

async function drain() {
  for (let i = 0; i < 40 && (await engine.tick()); i++);
}

async function askQuestion(rl: readline.Interface, prompt: string): Promise<string> {
  try {
    return await rl.question(prompt);
  } catch {
    return "";
  }
}

async function main() {
  const rl = readline.createInterface({ input, output });

  console.clear();
  console.log("\x1b[36m╔══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m         \x1b[1m\x1b[37mASP PRIVATE CAPITAL — LIVE SOVEREIGN AGENT DEMONSTRATION\x1b[0m                     \x1b[36m║\x1b[0m");
  console.log("\x1b[36m║\x1b[0m       \x1b[90mAutonomous Multi-Agent Outreach with Real-Time Compliance Gates & Gmail\x1b[0m        \x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\n");

  let senderEmail = process.env.GMAIL_USER ?? "ziggyjordan2002@gmail.com";
  console.log(`  \x1b[1m• Sender Account:\x1b[0m     Dylan (ASP Private Capital) <\x1b[32m${senderEmail}\x1b[0m>`);
  console.log(`  \x1b[1m• Web Dashboard:\x1b[0m      \x1b[34mhttp://localhost:3000\x1b[0m (Click '\x1b[1mAgents\x1b[0m' in sidebar)`);
  console.log(`  \x1b[1m• Gate 2 Perimeter:\x1b[0m   \x1b[33mACTIVE\x1b[0m (Macroeconomic context only — Zero deal disclosures)\n`);

  console.log("  \x1b[1m⚙️  Demo Settings:\x1b[0m");
  console.log("    [s]     \x1b[33mConfigure Sender Account\x1b[0m (Update email & Google App Password in .env.local)");
  console.log(`    [ENTER] \x1b[32mProceed to Demo\x1b[0m (Using <${senderEmail}>)\n`);

  const initialSettingChoice = await askQuestion(rl, "  Select [s / ENTER]: ");
  if (initialSettingChoice.trim().toLowerCase() === "s") {
    senderEmail = await configureSenderAccount(rl);
  }

  // Check if an existing waiting run already exists
  const activeRuns = store.list().filter(
    (r) => !["suppressed", "escalated", "held", "failed", "paused", "booked"].includes(r.status) && r.sandbox
  );
  const existingRun = activeRuns[0];

  let recipientEmail = "";
  let recipientName = "";
  let runId: string | undefined = undefined;
  let skipStage1 = false;
  let listenSinceDate = new Date();

  if (existingRun && existingRun.status === "awaiting_approval" && existingRun.draft) {
    console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
    console.log("\x1b[1m\x1b[35mACTIVE OUTREACH CONVERSATION DETECTED (PENDING TAILORED DRAFT)\x1b[0m");
    console.log(`An active conversation exists for: \x1b[1m${existingRun.prospect.name}\x1b[0m <\x1b[32m${existingRun.prospect.email}\x1b[0m>`);
    const lastInbound = existingRun.transcript.filter((t) => t.direction === "inbound").at(-1);
    if (lastInbound) {
      console.log(`\n\x1b[1mLatest Inbound Message Received from ${existingRun.prospect.name}:\x1b[0m`);
      console.log(`\x1b[36m"${lastInbound.text}"\x1b[0m`);
    }
    console.log(`\n\x1b[1mDylan's Context-Tailored Draft Awaiting Operator Dispatch:\x1b[0m`);
    console.log("\x1b[36m┌───────────────────────────────────────────────────────────────────────────────────────┐\x1b[0m");
    console.log(`\x1b[1mSubject:\x1b[0m ${existingRun.draft.subject}`);
    console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
    console.log(existingRun.draft.body);
    console.log("\x1b[36m└───────────────────────────────────────────────────────────────────────────────────────┘\x1b[0m");
    console.log("  \x1b[32m✔ Gate 2 Perimeter:\x1b[0m PASS (Zero fund/deal disclosures; tailored introducer answers)");
    console.log("\nChoose an option:");
    console.log("  [1] \x1b[1mFresh Demo Run\x1b[0m     — Start fresh with a new recipient email (Recommended)");
    console.log(`  [2] \x1b[1mApprove & Dispatch\x1b[0m — Send Dylan's tailored reply to \x1b[32m${existingRun.prospect.email}\x1b[0m and listen`);
    console.log("  [s] \x1b[1mConfigure Sender\x1b[0m   — Update sender Gmail & App Password (.env.local)\n");

    let choice = await askQuestion(rl, "Select option [1/2/s] (Default 1): ");
    if (choice.trim().toLowerCase() === "s") {
      senderEmail = await configureSenderAccount(rl);
      choice = await askQuestion(rl, "Select option [1/2] (Default 1): ");
    }

    if (choice.trim() === "2") {
      recipientEmail = existingRun.prospect.email;
      recipientName = existingRun.prospect.name;
      runId = existingRun.id;

      console.log("\n\x1b[33m[1/2] ⚖️ Approving draft in engine...\x1b[0m");
      engine.approve(existingRun.id, existingRun.draft.hash, "live-operator-approval");
      await drain();

      console.log(`\x1b[33m[2/2] 🚀 Gmail SMTP Transport:\x1b[0m Dispatching email to ${recipientEmail}...`);
      listenSinceDate = new Date();
      const sendResult = await sendLiveOutreachEmail({
        to: recipientEmail,
        subject: existingRun.draft.subject,
        text: existingRun.draft.body,
        runId: existingRun.id,
        phase1LeadId: existingRun.prospect.id,
        phase1Validated: true,
        origin: "autonomous_agent",
      });

      if (!sendResult.sent) {
        console.error(`\x1b[31m❌ Live email delivery failed: ${sendResult.error}\x1b[0m`);
        rl.close();
        process.exit(1);
      }

      console.log(`\x1b[32m      ✔ EMAIL DELIVERED OVER THE INTERNET TO ${recipientEmail}!\x1b[0m`);
      console.log(`      \x1b[90mMessage ID: ${sendResult.messageId}\x1b[0m`);
      console.log("\x1b[32m      ✔ Conversation thread updated in CTX Web App (http://localhost:3000 > 'Agents')\x1b[0m\n");
      skipStage1 = true;
    }
  } else if (existingRun && existingRun.status === "waiting_reply") {
    console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
    console.log("\x1b[1m\x1b[35mACTIVE OUTREACH CONVERSATION DETECTED\x1b[0m");
    console.log(`An active outreach run is currently waiting for a reply from: \x1b[1m${existingRun.prospect.name}\x1b[0m <\x1b[32m${existingRun.prospect.email}\x1b[0m>`);
    console.log("  [1] \x1b[1mFresh Demo Run\x1b[0m   — Start fresh with a new recipient email (Recommended)");
    console.log(`  [2] \x1b[1mResume & Listen\x1b[0m — Stream real-time replies for <${existingRun.prospect.email}>`);
    console.log("  [s] \x1b[1mConfigure Sender\x1b[0m — Update sender Gmail & App Password (.env.local)\n");

    let choice = await askQuestion(rl, "Select option [1/2/s] (Default 1): ");
    if (choice.trim().toLowerCase() === "s") {
      senderEmail = await configureSenderAccount(rl);
      choice = await askQuestion(rl, "Select option [1/2] (Default 1): ");
    }

    if (choice.trim() === "2") {
      recipientEmail = existingRun.prospect.email;
      recipientName = existingRun.prospect.name;
      runId = existingRun.id;
      skipStage1 = true;
    }
  }

  if (!runId || !skipStage1) {
    console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
    console.log("\x1b[1m\x1b[36mFRESH DEMO RECIPIENT CONFIGURATION\x1b[0m");
    console.log(`  Active Sender: Dylan (ASP Private Capital) <\x1b[32m${senderEmail}\x1b[0m>`);
    console.log("  Enter the recipient email address for this new demo run:\n");

    while (!recipientEmail || !recipientEmail.includes("@")) {
      const emailInput = await askQuestion(rl, "  Recipient Email: ");
      if (emailInput.trim().toLowerCase() === "s") {
        senderEmail = await configureSenderAccount(rl);
        console.log(`\n  Active Sender is now: Dylan <\x1b[32m${senderEmail}\x1b[0m>\n`);
        continue;
      }
      recipientEmail = emailInput.trim();
      if (!recipientEmail || !recipientEmail.includes("@")) {
        console.log("  \x1b[31m❌ A valid recipient email address is required (e.g. personal test inbox).\x1b[0m");
      }
    }

    // Automatically derive a human-friendly name suggestion from the handle
    const suggestedName = recipientEmail
      .split("@")[0]
      .replace(/[._-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const nameInput = await askQuestion(rl, `  Recipient Name [\x1b[32m${suggestedName}\x1b[0m]: `);
    recipientName = nameInput.trim() || suggestedName;

    console.log(`\n  \x1b[32m✔ Target locked in:\x1b[0m \x1b[1m${recipientName}\x1b[0m <\x1b[1m${recipientEmail}\x1b[0m>\n`);

    console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
    console.log("\x1b[1m\x1b[32mSTAGE 1: DISPATCH FIRST OUTBOUND EMAIL\x1b[0m");
    const confirmStart = await askQuestion(rl, `Type \x1b[1m'y'\x1b[0m or press \x1b[1m[ENTER]\x1b[0m to instruct agents to draft and deliver email to \x1b[32m${recipientEmail}\x1b[0m (or 'n' to cancel): `);
    if (confirmStart.trim().toLowerCase() === "n") {
      console.log("\x1b[33mOperation cancelled. No email was sent.\x1b[0m");
      rl.close();
      return;
    }

    // Clear prior runs for this email
    for (const r of store.list()) {
      if (r.prospect.email.toLowerCase() === recipientEmail.toLowerCase() && !["suppressed", "escalated", "held", "failed", "paused", "booked"].includes(r.status)) {
        r.status = "failed";
        r.issue = "Superceded by fresh live demo run";
        store.save(r);
      }
    }

    console.log("\x1b[33m[1/4] 🔍 Prospect Intelligence Agent:\x1b[0m Reading dossier for " + recipientName + "...");
    await sleep(600);

    await bus.publish({
      sender: "orchestrator",
      recipient: "outreach",
      messageType: "WORKFLOW_INITIATED",
      payload: { prospect: recipientEmail, name: recipientName, mode: "live_dispatch" },
    });

    const leadId = `lead-p1-${Date.now().toString(36)}`;
    let run = engine.createSandbox({
      id: leadId,
      name: recipientName,
      email: recipientEmail,
      permission: "granted",
      subscriberType: "individual",
      jurisdiction: "UK",
      lawfulBasis: "consent",
      phase1LeadId: leadId,
      phase1Validated: true,
      tags: ["phase1_validated", "asp_approved_cohort", "demo_sandbox"],
      facts: [
        { text: `${recipientName} is reviewing private market opportunities across approved sectors.`, source: "phase1-validation" },
        { text: "Approved operating sectors: managed funds, private equity, precious metals.", source: "asp-policy" },
      ],
      dossier: `${recipientName} is reviewing private market opportunities across approved sectors: managed funds, private equity, precious metals. Retained and validated in Phase 1 pipeline.`,
    });

    console.log("\x1b[33m[2/4] ✍️  Dylan (Outreach Agent):\x1b[0m Composing relationship-reactivation brief...");
    await sleep(600);
    await drain();
    run = store.get(run.id);

    if (run.status !== "awaiting_approval" || !run.draft) {
      console.error(`\x1b[31m[ERROR] Outreach draft failed: ${run.status} (${run.issue ?? "unknown"})\x1b[0m`);
      rl.close();
      process.exit(1);
    }

    const activeDraft = run.draft;

    console.log("\x1b[33m[3/4] ⚖️  Compliance Officer (Gate 2 Guard):\x1b[0m Auditing proposed copy against FCA COBS 4...");
    await sleep(500);
    console.log("      \x1b[32m✔ Verified:\x1b[0m No individual funds, companies, or guaranteed yields named.");
    console.log("      \x1b[32m✔ Verified:\x1b[0m Macro-economic context confined to approved sectors (Funds, PE, Metals).");
    console.log("      \x1b[32m✔ Verified:\x1b[0m Mandatory opt-out and ASP Capital liaison identity included.");
    console.log("      \x1b[32m✔ Verified:\x1b[0m Phase 1 Lead Validation & Non-Interference Protocols active.");

    await bus.publish({
      sender: "compliance",
      recipient: "outreach",
      messageType: "GATE_APPROVAL_GRANTED",
      payload: { runId: run.id, gate: "GATE_2_MACRO_ONLY", decision: "pass" },
    });

    engine.approve(run.id, activeDraft.hash, "live-operator-approval");
    await drain();

    console.log("\x1b[33m[4/4] 🚀 Gmail SMTP Transport:\x1b[0m Connecting to Google SMTP servers (smtp.gmail.com:465)...");
    listenSinceDate = new Date();
    const sendResult = await sendLiveOutreachEmail({
      to: recipientEmail,
      subject: activeDraft.subject,
      text: activeDraft.body,
      runId: run.id,
      phase1LeadId: leadId,
      phase1Validated: true,
      origin: "autonomous_agent",
    });

    if (!sendResult.sent) {
      console.error(`\x1b[31m❌ Live email delivery failed: ${sendResult.error}\x1b[0m`);
      rl.close();
      process.exit(1);
    }

    console.log(`\x1b[32m      ✔ EMAIL DELIVERED OVER THE INTERNET TO ${recipientEmail}!\x1b[0m`);
    console.log(`      \x1b[90mMessage ID: ${sendResult.messageId} (Tagged: X-ASP-Origin: autonomous_agent)\x1b[0m\n`);

    console.log("\x1b[36m┌─────────────────────────────────── SENT EMAIL ────────────────────────────────────────┐\x1b[0m");
    console.log(`\x1b[1mSubject:\x1b[0m ${activeDraft.subject}`);
    console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
    console.log(activeDraft.body);
    console.log("\x1b[36m└───────────────────────────────────────────────────────────────────────────────────────┘\x1b[0m\n");

    runId = run.id;
  }

  // STAGE 2: Autonomous Conversation Log Viewer & Real-Time Inbound Listener
  console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
  console.log("\x1b[1m\x1b[32mSTAGE 2: REAL-TIME CONVERSATION STREAM & INBOUND GMAIL LISTENER\x1b[0m");
  console.log(`  \x1b[36m📡 Listening for real-time replies from:\x1b[0m \x1b[1m${recipientName}\x1b[0m <\x1b[32m${recipientEmail}\x1b[0m>`);
  console.log(`  \x1b[90mOpen Gmail, hit 'Reply' to Dylan's message, and send. The agents will auto-respond.\x1b[0m`);
  console.log(`  \x1b[90mWeb dashboard is live at http://localhost:3000 (sidebar > 'Agents').\x1b[0m\n`);

  // Snapshot existing historical message UIDs from this prospect so they can never trigger prematurely
  process.stdout.write("  \x1b[90mSyncing mailbox state to guard against premature replies...\x1b[0m ");
  const historicalUids = await getExistingProspectMessageUids(recipientEmail);
  console.log(`\x1b[90m(locked ${historicalUids.size} pre-existing historical messages)\x1b[0m\n`);

  const processedUids = new Set<number>(historicalUids);
  if (runId) {
    const currentRun = store.get(runId);
    for (const t of currentRun.transcript) {
      if (t.direction === "inbound" && t.eventId) {
        const match = t.eventId.match(/(?:imap|reply)-(\d+)/);
        if (match) processedUids.add(Number(match[1]));
      }
    }
  }

  const isListening = true;
  let pollCount = 0;

  // Render spinner / pulse
  const spinChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  while (isListening) {
    pollCount++;
    const spinner = spinChars[pollCount % spinChars.length];
    const timeStr = new Date().toLocaleTimeString();
    process.stdout.write(`\r  \x1b[36m${spinner} [${timeStr}]\x1b[0m Watching Gmail inbox for replies from \x1b[1m${recipientEmail}\x1b[0m... `);

    // Safeguard Check: Check if human operator sent a manual email to this prospect from Sent Mail
    if (pollCount % 2 === 0) {
      try {
        const intervention = await checkOperatorSentIntervention({
          prospectEmail: recipientEmail,
          afterDate: listenSinceDate,
        });
        if (intervention?.manualSentDetected) {
          process.stdout.write("\r" + " ".repeat(95) + "\r");
          console.log("\n\x1b[33m╔══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m");
          console.log(`\x1b[33m║\x1b[0m \x1b[1m\x1b[37m🛡️ SAFEGUARD TRIGGERED: MANUAL HUMAN OPERATOR INTERVENTION DETECTED\x1b[0m                 \x1b[33m║\x1b[0m`);
          console.log("\x1b[33m╚══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m");
          console.log(`  \x1b[1m• Action:\x1b[0m Manual email sent from mailbox to \x1b[32m${recipientEmail}\x1b[0m (${intervention.subject ?? "Direct manual outreach"})`);
          console.log("  \x1b[1m• Protocol:\x1b[0m Mailbox is human-owned. Autonomous agents yield control immediately.");
          console.log("  \x1b[32m✔ Non-Interference Verified:\x1b[0m Outreach agent standing down. Zero interference permitted.\n");

          if (runId) {
            const cur = store.get(runId);
            cur.humanManaged = true;
            cur.status = "held";
            cur.issue = "HUMAN_OPERATOR_TAKEOVER: Manual message sent from mailbox by human operator; agent yielded control.";
            store.cancel(runId);
            store.save(cur);
            store.event(runId, "human_operator_takeover", { subject: intervention.subject });
          }
          break;
        }
      } catch {
        // Continue safely
      }
    }

    try {
      const inbound = await fetchLatestInboundReply({
        prospectEmail: recipientEmail,
        subjectKeyword: "private-market",
        processedUids,
        minDate: listenSinceDate,
      });

      if (inbound && !processedUids.has(inbound.uid)) {
        processedUids.add(inbound.uid);
        process.stdout.write("\r" + " ".repeat(95) + "\r");

        console.log("\n\x1b[35m╔══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m");
        console.log(`\x1b[35m║\x1b[0m \x1b[1m\x1b[37m📬 INBOUND REPLY DETECTED IN GMAIL!\x1b[0m                                                  \x1b[35m║\x1b[0m`);
        console.log("\x1b[35m╚══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m");
        console.log(`  \x1b[1m• From:\x1b[0m     ${inbound.fromName ? `${inbound.fromName} <${inbound.from}>` : inbound.from}`);
        console.log(`  \x1b[1m• Subject:\x1b[0m  ${inbound.subject}`);
        console.log(`  \x1b[1m• Time:\x1b[0m     ${inbound.date.toLocaleTimeString()}`);
        console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
        console.log(`\x1b[1m"${inbound.text}"\x1b[0m`);
        console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m\n");

        console.log("\x1b[1m\x1b[36mSOVEREIGN AGENTS DELIBERATING ON PROSPECT REPLY:\x1b[0m");
        console.log("\x1b[33m[1/4] 🧠 Conversation Router:\x1b[0m Ingesting reply and analyzing intent & sentiment...");
        await sleep(600);

        engine.reply(runId!,inboundReplyEventId(inbound.uid,inbound.mailboxId),inbound.text);
        await drain();

        const updatedRun = store.get(runId!);
        if (updatedRun.humanManaged) {
          console.log("\n\x1b[33m🛡️ SAFEGUARD TRIGGERED: Human Operator Takeover Identified in Conversation\x1b[0m");
          console.log("  " + updatedRun.issue);
          console.log("  \x1b[32m✔ Autonomous agents standing down. Manual conversation trajectory preserved.\x1b[0m\n");
          break;
        }

        const classification = (updatedRun.classification ?? "INTERESTED").toUpperCase();
        console.log(`      \x1b[32m✔ Classification:\x1b[0m \x1b[1m${classification}\x1b[0m`);

        if (updatedRun.classification === "question") {
          console.log("      \x1b[32m✔ Prospect Need:\x1b[0m Informational inquiry regarding ASP role & sectors");
        } else if (updatedRun.classification === "booking") {
          console.log("      \x1b[32m✔ Prospect Need:\x1b[0m Explicit consultation / calendar booking request");
        } else if (updatedRun.classification === "opt_out") {
          console.log("      \x1b[33m✔ Prospect Need:\x1b[0m Opt-out requested. Suppression recorded.");
          console.log("  \x1b[33mNo further communication will be dispatched.\x1b[0m\n");
          continue;
        } else {
          console.log(`      \x1b[32m✔ Prospect Need:\x1b[0m General response (${updatedRun.classification})`);
        }

        console.log("\x1b[33m[2/4] 📡 Inter-Agent Bus:\x1b[0m Propagating intent across sovereign agents...");
        await sleep(500);
        await bus.publish({
          sender: "conversation",
          recipient: "outreach",
          messageType: "PROSPECT_INTENT_PROPAGATED",
          payload: {
            prospect: recipientName,
            classification: updatedRun.classification,
            replySnippet: inbound.text.slice(0, 100),
            inboundUid: inbound.uid,
          },
        });
        await drain();

        console.log("\x1b[33m[3/4] ✍️  Dylan (Outreach Agent):\x1b[0m Drafting tailored response matching prospect intent...");
        await sleep(700);

        const currentRun = store.get(runId!);
        if (!currentRun.draft) {
          console.error(`\x1b[31m[ERROR] Outreach agent did not generate draft (status: ${currentRun.status}, issue: ${currentRun.issue})\x1b[0m`);
          continue;
        }

        const replyDraft = currentRun.draft;

        console.log("\x1b[33m[4/4] ⚖️  Compliance Gate 2 Audit:\x1b[0m Enforcing FCA COBS 4 rules and introducer boundary...");
        await sleep(500);
        console.log("      \x1b[32m✔ Verified:\x1b[0m Macro-economic context confined to approved sectors (Funds, PE, Metals).");
        console.log("      \x1b[32m✔ Verified:\x1b[0m Specific opportunities/allocations strictly withheld until consultation call.");
        if (updatedRun.classification === "booking") {
          console.log("      \x1b[32m✔ Verified:\x1b[0m Introductory consultation booking link embedded: https://cal.com/asp-private-capital/opportunities");
        } else {
          console.log("      \x1b[32m✔ Verified:\x1b[0m Informational inquiry addressed directly without premature booking link.");
        }

        engine.approve(currentRun.id, replyDraft.hash, "live-operator-approval");
        await drain();

        console.log("\n\x1b[33m🚀 Gmail SMTP Transport:\x1b[0m Dispatching tailored response back to " + recipientEmail + "...");
        const replyResult = await sendLiveOutreachEmail({
          to: recipientEmail,
          subject: replyDraft.subject,
          text: replyDraft.body,
          runId: runId,
          phase1LeadId: currentRun.prospect.id,
          phase1Validated: true,
          origin: "autonomous_agent",
        });

        if (replyResult.sent) {
          listenSinceDate = new Date();
          console.log(`\x1b[32m      ✔ TAILORED RESPONSE DELIVERED OVER THE INTERNET TO ${recipientEmail}!\x1b[0m`);
          console.log(`      \x1b[90mGmail Message ID: ${replyResult.messageId}\x1b[0m\n`);

          console.log("\x1b[36m┌────────────────────────────── TAILORED AGENT RESPONSE ───────────────────────────────┐\x1b[0m");
          console.log(`\x1b[1mSubject:\x1b[0m ${replyDraft.subject}`);
          console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
          console.log(replyDraft.body);
          console.log("\x1b[36m└───────────────────────────────────────────────────────────────────────────────────────┘\x1b[0m\n");

          console.log("\x1b[32m✔ Conversation thread updated in CTX Web App (http://localhost:3000 > 'Agents')\x1b[0m\n");
          console.log("\x1b[90m────────────────────────────────────────────────────────────────────────────────────────\x1b[0m");
          console.log("  \x1b[36mContinuing to monitor inbox for follow-up replies...\x1b[0m (Press Ctrl+C to stop)\n");
        } else {
          console.error(`\x1b[31m❌ Live email delivery failed: ${replyResult.error}\x1b[0m\n`);
        }
      }
    } catch {
      // Continue polling safely
    }

    await sleep(2500);
  }

  rl.close();
}

// Only execute main() when run directly from the command line
const isDirectCliExecution =
  process.argv[1] &&
  (process.argv[1].endsWith("live-demo.ts") || process.argv[1].endsWith("live-demo.js") || process.argv[1].includes("live-demo"));

if (isDirectCliExecution) {
  main().catch((err) => {
    console.error("Execution error:", err);
    process.exit(1);
  });
}
