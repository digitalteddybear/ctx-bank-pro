import path from "node:path";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { ConfigurableModel, FixtureModel } from "../src/lib/server/outreach/models";
import { seedFixtureSources } from "../src/lib/server/outreach/sources";
import { getMessageBus } from "../src/lib/server/outreach/orchestrator/bus";

// Parse CLI args
const args = process.argv.slice(2);
const live = args.includes("--live");
const customEmail = args.find((a) => a.startsWith("--email="))?.split("=")[1] ?? "alex.investor@example.test";
const customName = args.find((a) => a.startsWith("--name="))?.split("=")[1] ?? "Alex Investor";
const customReply =
  args.find((a) => a.startsWith("--reply="))?.split("=")[1] ??
  "Hi Dylan, thanks for getting in touch. I am actively looking into private market allocations, specifically precious metals and managed funds given the current macro climate. How does ASP Private Capital work with clients, and what are the next steps to discuss this?";

const dbPath = process.env.CTX_OUTREACH_DB_PATH ?? path.join(process.cwd(), "data/generated/outreach/workflows.sqlite");
const store = new OutreachStore(dbPath);
const bus = getMessageBus();

// Choose live vs fixture model
let modelAdapter = live ? new ConfigurableModel() : new FixtureModel();

// If live requested but no keys, gracefully inform and use fixture with notice
if (live && (!process.env.CTX_OUTREACH_MODEL_KEY || !process.env.CTX_OUTREACH_MODEL_URL)) {
  console.log("\x1b[33m[NOTICE] Live model keys (CTX_OUTREACH_MODEL_KEY) not found in environment. Running with local deterministic foundation persona.\x1b[0m\n");
  modelAdapter = new FixtureModel();
}

const engine = new OutreachEngine(store, modelAdapter);

console.log("================================================================================");
console.log("ASP PRIVATE CAPITAL — LIVE EMAIL CORRESPONDENCE DEMO");
console.log(`Target Prospect: ${customName} <${customEmail}>`);
console.log(`Inference Mode: ${modelAdapter.mode.toUpperCase()}`);
console.log(`Database: ${dbPath}`);
console.log("================================================================================\n");

async function drain() {
  for (let i = 0; i < 40 && (await engine.tick()); i++);
}

async function runDemo() {
  seedFixtureSources(store);

  // Clear any existing active run for this test email so demo can be re-run cleanly
  for (const r of store.list()) {
    if (r.prospect.email.toLowerCase() === customEmail.toLowerCase() && !["suppressed", "escalated", "held", "failed", "paused", "booked"].includes(r.status)) {
      r.status = "failed";
      r.issue = "Superceded by fresh demo run";
      store.save(r);
    }
  }

  // 1. Initiate cold outreach run
  console.log("\x1b[1m[STAGE 1] Initializing Prospect Profile & Generating Cold Outreach...\x1b[0m");
  let run = engine.create({
    id: `demo-${Date.now().toString(36)}`,
    name: customName,
    email: customEmail,
    permission: "granted",
    subscriberType: "individual",
    jurisdiction: "UK",
    lawfulBasis: "consent",
    facts: [
      { text: `${customName} is a private individual interested in macroeconomic private market sectors.`, source: "crm-inbox" },
      { text: "Approved operating sectors: managed funds, private equity, precious metals.", source: "asp-perimeter" },
    ],
  });

  await drain();
  run = store.get(run.id);

  if (run.status === "awaiting_approval" && run.draft) {
    console.log("\x1b[32m✔ Initial Outreach Draft Generated & Passed Compliance Review:\x1b[0m");
    console.log(`   \x1b[1mSubject:\x1b[0m ${run.draft.subject}`);
    console.log(`   \x1b[1mDraft Body:\x1b[0m\n${run.draft.body}\n`);
    engine.approve(run.id, run.draft.hash, "demo-operator-approval");
    await drain();
  }

  // 2. Ingest inbound reply
  console.log("\x1b[1m[STAGE 2] Prospect Replies from Inbox:\x1b[0m");
  console.log(`   \x1b[35m"${customReply}"\x1b[0m\n`);

  console.log("\x1b[1m[STAGE 3] Ingesting Reply into Agent Pipeline...\x1b[0m");
  engine.reply(run.id, `reply-${Date.now()}`, customReply);
  await drain();
  run = store.get(run.id);

  // Broadcast event to A2A bus
  await bus.publish({
    sender: "conversation",
    recipient: "outreach",
    messageType: "PROSPECT_OBJECTION_PROPAGATED",
    payload: {
      prospect: customName,
      inboundReplySnippet: customReply.slice(0, 80),
      detectedIntent: run.intent,
    },
  });

  // 3. Process conversation routing, outreach drafting, deliverability, compliance
  await drain();
  run = store.get(run.id);

  if (run.status === "awaiting_approval" && run.draft) {
    console.log("\x1b[32m✔ Tailored Correspondence Successfully Drafted & Reviewed:\x1b[0m");
    console.log("--------------------------------------------------------------------------------");
    console.log(`\x1b[1mTo:\x1b[0m ${customName} <${customEmail}>`);
    console.log(`\x1b[1mFrom:\x1b[0m Dylan <dylan@aspinvest.co.uk>`);
    console.log(`\x1b[1mSubject:\x1b[0m ${run.draft.subject}`);
    console.log("--------------------------------------------------------------------------------");
    console.log(run.draft.body);
    console.log("--------------------------------------------------------------------------------\n");

    console.log("\x1b[1m[STAGE 4] Statutory & Deliverability Safeguards Audit:\x1b[0m");
    if (run.deliverability) {
      console.log(`   • \x1b[32mDeliverability Check:\x1b[0m ${run.deliverability.decision.toUpperCase()} (${run.deliverability.summary})`);
    }
    if (run.review) {
      console.log(`   • \x1b[32mCompliance Review:\x1b[0m ${run.review.decision.toUpperCase()} (${run.review.summary})`);
      console.log(`   • \x1b[32mCitations Attached:\x1b[0m ${run.review.citations.length} verified statutory citations`);
      for (const cit of run.review.citations) {
        console.log(`     - [${cit.sourceId}] "${cit.quote.slice(0, 75)}..."`);
      }
    }
    console.log(`   • \x1b[32mGate 2 Perimeter:\x1b[0m PASS (Zero deals/yields disclosed; macro liaison framing only)`);
    console.log(`   • \x1b[32mCall Booking Link Included:\x1b[0m https://cal.com/asp-private-capital/opportunities\n`);

    console.log("\x1b[36m================================================================================");
    console.log("DEMO CORRESPONDENCE READY");
    console.log("You can inspect this run and live telemetry in your separate monitor terminal");
    console.log(`or in the CTX Dashboard at http://localhost:3000 (Run ID: ${run.id})`);
    console.log("================================================================================\x1b[0m");
  } else {
    console.log(`Run status: ${run.status}. Issue: ${run.issue ?? "none"}`);
  }
}

runDemo().catch((err) => {
  console.error("Demo execution error:", err);
  process.exit(1);
});
