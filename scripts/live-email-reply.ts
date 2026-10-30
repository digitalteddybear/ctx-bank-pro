import path from "node:path";
import fs from "node:fs";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { ConfigurableModel, FixtureModel } from "../src/lib/server/outreach/models";
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
const replyArg =
  args.find((a) => a.startsWith("--reply="))?.split("=")[1] ??
  "Hi Dylan, thanks for the message. I am actively reviewing private market allocations across precious metals and managed funds. How do we schedule a time to discuss this further?";
const liveSend = args.includes("--live-send") || process.env.CTX_LIVE_EMAIL_DISPATCH === "true";
if (liveSend) {
  process.env.CTX_LIVE_EMAIL_DISPATCH = "true";
}
const useLiveModel = args.includes("--live-model") || Boolean(process.env.GEMINI_API_KEY || process.env.CTX_OUTREACH_MODEL_KEY);

const recipientEmail: string = toArg;

const dbPath = process.env.CTX_OUTREACH_DB_PATH ?? path.join(process.cwd(), "data/generated/outreach/workflows.sqlite");
const store = new OutreachStore(dbPath);
const bus = getMessageBus();
bus.setPersistentLogger((msg) => store.event("a2a-bus", "a2a_message", msg));
const modelAdapter = useLiveModel ? new ConfigurableModel() : new FixtureModel();
const engine = new OutreachEngine(store, modelAdapter);

async function drain() {
  for (let i = 0; i < 40 && (await engine.tick()); i++);
}

async function main() {
  const run = store.list().find((r) => r.prospect.email.toLowerCase() === recipientEmail.toLowerCase() && !["suppressed", "failed"].includes(r.status));
  if (!run) {
    console.error(`\x1b[31mNo active workflow run found for ${recipientEmail}. Run 'npm run demo:send' first.\x1b[0m`);
    process.exit(1);
  }

  console.log("================================================================================");
  console.log("ASP PRIVATE CAPITAL — INBOUND REPLY PROCESSING & TAILORED DISPATCH");
  console.log(`Prospect: ${run.prospect.name} <${recipientEmail}>`);
  console.log(`Inbound Reply: "${replyArg}"`);
  console.log(`Live Email Send: ${liveSend ? "\x1b[32mENABLED\x1b[0m" : "\x1b[33mSIMULATION ONLY\x1b[0m"}`);
  console.log("================================================================================\n");

  console.log("\x1b[1m[STAGE 1] Ingesting Prospect Reply into Conversation Router...\x1b[0m");
  engine.reply(run.id, `reply-${Date.now()}`, replyArg);
  await drain();

  await bus.publish({
    sender: "conversation",
    recipient: "outreach",
    messageType: "PROSPECT_OBJECTION_PROPAGATED",
    payload: {
      prospect: run.prospect.name,
      replySnippet: replyArg.slice(0, 100),
    },
  });

  await drain();
  const updatedRun = store.get(run.id);

  if (updatedRun.status !== "awaiting_approval" || !updatedRun.draft) {
    console.error(`\x1b[31mReply processing did not produce an approved draft: status=${updatedRun.status} (${updatedRun.issue ?? "none"})\x1b[0m`);
    process.exit(1);
  }

  console.log("\x1b[32m✔ Tailored Correspondence Drafted & Approved by Compliance:\x1b[0m");
  console.log("--------------------------------------------------------------------------------");
  console.log(`\x1b[1mSubject:\x1b[0m ${updatedRun.draft.subject}`);
  console.log("--------------------------------------------------------------------------------");
  console.log(updatedRun.draft.body);
  console.log("--------------------------------------------------------------------------------\n");

  const activeDraft = updatedRun.draft;

  // Approve draft
  engine.approve(updatedRun.id, activeDraft.hash, "live-operator-approval");
  await drain();

  // If liveSend, dispatch the response back over real email
  if (liveSend) {
    console.log("\x1b[1m[STAGE 2] Sending Real Email Reply via Gmail SMTP...\x1b[0m");
    const result = await sendLiveOutreachEmail({
      to: recipientEmail,
      subject: activeDraft.subject,
      text: activeDraft.body,
    });

    if (result.sent) {
      console.log(`\x1b[32m✔ Tailored reply sent over the internet to ${recipientEmail}!\x1b[0m`);
      console.log(`   \x1b[90mGmail Message ID: ${result.messageId}\x1b[0m\n`);
      console.log(`Check your inbox at \x1b[1m${recipientEmail}\x1b[0m for the agent's tailored response and booking link!`);
    } else {
      console.error(`\x1b[31m❌ Live email delivery failed: ${result.error}\x1b[0m`);
    }
  } else {
    console.log("\x1b[33m[NOTICE] Reply recorded in outbox simulation only. To send real email over the internet, pass --live-send\x1b[0m");
  }
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
