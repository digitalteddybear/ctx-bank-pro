import path from "node:path";
import fs from "node:fs";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { ConfigurableModel, FixtureModel } from "../src/lib/server/outreach/models";
import { seedFixtureSources } from "../src/lib/server/outreach/sources";
import { sendLiveOutreachEmail } from "../src/lib/server/outreach/transport/email";
import { getMessageBus } from "../src/lib/server/outreach/orchestrator/bus";

// Auto-load environment files if present
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

const args = process.argv.slice(2);
const toArg = args.find((a) => a.startsWith("--to="))?.split("=")[1] ?? process.env.DEMO_RECIPIENT_EMAIL ?? "digitalteddybear2002@gmail.com";
const nameArg = args.find((a) => a.startsWith("--name="))?.split("=")[1] ?? "Test Contact";
const liveSend = args.includes("--live-send") || process.env.CTX_LIVE_EMAIL_DISPATCH === "true";
if (liveSend) {
  process.env.CTX_LIVE_EMAIL_DISPATCH = "true";
}
const useLiveModel = args.includes("--live-model") || Boolean(process.env.GEMINI_API_KEY || process.env.CTX_OUTREACH_MODEL_KEY);

const recipientEmail: string = toArg;

const dbPath = process.env.CTX_OUTREACH_DB_PATH ?? path.join(process.cwd(), "data/generated/outreach/workflows.sqlite");
const store = new OutreachStore(dbPath);
seedFixtureSources(store);

const bus = getMessageBus();
bus.setPersistentLogger((msg) => store.event("a2a-bus", "a2a_message", msg));

// Model selection: Gemini Flash if key present and requested, else Fixture
const modelAdapter = useLiveModel ? new ConfigurableModel() : new FixtureModel();
const engine = new OutreachEngine(store, modelAdapter);

async function drain() {
  for (let i = 0; i < 40 && (await engine.tick()); i++);
}

async function main() {
  console.log("================================================================================");
  console.log("ASP PRIVATE CAPITAL — LIVE EMAIL AGENT DISPATCH");
  console.log(`Recipient Inbox: ${toArg}`);
  console.log(`Sending Gmail Account: ${process.env.GMAIL_USER ?? "NOT CONFIGURED"}`);
  console.log(`Live Email Dispatch: ${liveSend ? "\x1b[32mENABLED (WILL SEND REAL EMAIL)\x1b[0m" : "\x1b[33mSIMULATION ONLY (Add --live-send to deliver)\x1b[0m"}`);
  console.log(`Inference Engine: ${useLiveModel ? "\x1b[32mGEMINI FLASH LIVE\x1b[0m" : "\x1b[36mDETERMINISTIC AGENT PERSONA\x1b[0m"}`);
  console.log("================================================================================\n");

  // Clear prior runs for this email
  for (const r of store.list()) {
    if (r.prospect.email.toLowerCase() === recipientEmail.toLowerCase() && !["suppressed", "escalated", "held", "failed", "paused", "booked"].includes(r.status)) {
      r.status = "failed";
      r.issue = "Superceded by fresh live demo run";
      store.save(r);
    }
  }

  // 1. Prospect creation & initial outreach drafting
  console.log("\x1b[1m[STAGE 1] Sovereign Agents Generating Initial Outreach...\x1b[0m");
  await bus.publish({
    sender: "orchestrator",
    recipient: "outreach",
    messageType: "WORKFLOW_INITIATED",
    payload: {
      prospect: recipientEmail,
      name: nameArg,
      mode: liveSend ? "live_dispatch" : "simulation",
    },
  });

  let run = engine.createSandbox({
    id: `live-${Date.now().toString(36)}`,
    name: nameArg,
    email: recipientEmail,
    permission: "granted",
    subscriberType: "individual",
    jurisdiction: "UK",
    lawfulBasis: "consent",
    facts: [
      { text: `${nameArg} is reviewing private market opportunities across approved sectors.`, source: "live-demo" },
      { text: "Approved operating sectors: managed funds, private equity, precious metals.", source: "asp-policy" },
    ],
    dossier: `${nameArg} is reviewing private market opportunities across approved sectors: managed funds, private equity, precious metals.`,
  });

  await drain();
  run = store.get(run.id);

  if (run.status !== "awaiting_approval" || !run.draft) {
    console.error(`\x1b[31mInitial outreach drafting did not pass review: ${run.status} (${run.issue ?? "unknown"})\x1b[0m`);
    process.exit(1);
  }

  const activeDraft = run.draft;

  await bus.publish({
    sender: "compliance",
    recipient: "outreach",
    messageType: "GATE_APPROVAL_GRANTED",
    payload: {
      runId: run.id,
      gate: "GATE_2_MACRO_ONLY",
      decision: "pass",
    },
  });

  console.log("\x1b[32m✔ Initial Outreach Draft Passed Compliance Review & Gate 2:\x1b[0m");
  console.log(`   \x1b[1mSubject:\x1b[0m ${activeDraft.subject}`);
  console.log(`   \x1b[1mBody:\x1b[0m\n${activeDraft.body}\n`);

  // Approve draft
  engine.approve(run.id, activeDraft.hash, "live-operator-approval");
  await drain();
  run = store.get(run.id);

  // 2. Real Email Dispatch
  if (liveSend) {
    console.log("\x1b[1m[STAGE 2] Dispatching Real Email via Gmail SMTP...\x1b[0m");
    const result = await sendLiveOutreachEmail({
      to: recipientEmail,
      subject: activeDraft.subject,
      text: activeDraft.body,
    });

    if (result.sent) {
      console.log(`\x1b[32m✔ Email successfully sent over the internet to ${toArg}!\x1b[0m`);
      console.log(`   \x1b[90mGmail Message ID: ${result.messageId}\x1b[0m\n`);
      console.log("--------------------------------------------------------------------------------");
      console.log(`\x1b[36mNEXT STEP:\x1b[0m`);
      console.log(`1. Open your inbox at \x1b[1m${toArg}\x1b[0m to verify the email arrived.`);
      console.log(`2. Reply to the email (or craft a test reply).`);
      console.log(`3. Run the following command in this terminal to simulate/ingest your reply and have the agents draft the tailored booking response:`);
      console.log(`\n   \x1b[1mnpm run demo:reply -- --to="${toArg}" --reply="Thanks Dylan, I'm interested in precious metals. What are the next steps to discuss this?" ${liveSend ? "--live-send" : ""}\x1b[0m`);
      console.log("--------------------------------------------------------------------------------");
    } else {
      console.error(`\x1b[31m❌ Live email delivery failed: ${result.error}\x1b[0m`);
      console.log("\x1b[33mEnsure GMAIL_USER and GMAIL_APP_PASSWORD are set in .env.local\x1b[0m");
    }
  } else {
    console.log("\x1b[33m[NOTICE] Message recorded in outbox simulation only. To send real email over the internet, pass --live-send\x1b[0m");
  }
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
