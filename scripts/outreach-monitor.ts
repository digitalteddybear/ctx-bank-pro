import path from "node:path";
import fs from "node:fs";
import { OutreachStore } from "../src/lib/server/outreach/store";

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

const dbPath = process.env.CTX_OUTREACH_DB_PATH ?? path.join(process.cwd(), "data/generated/outreach/workflows.sqlite");
const store = new OutreachStore(dbPath);

console.clear();
console.log("================================================================================");
console.log("ASP PRIVATE CAPITAL — BACKEND AGENT TELEMETRY & EVENT MONITOR");
console.log(`Database: ${dbPath}`);
console.log("Monitoring real-time agent execution, state transitions, and A2A message bus...");
console.log("Press Ctrl-C to exit.");
console.log("================================================================================\n");

// Read from current tail of events table so we don't dump hundreds of old historical test logs
const latestRow = store.db.prepare("SELECT MAX(seq) as maxSeq FROM events").get() as { maxSeq?: number } | undefined;
let lastSeq = Number(latestRow?.maxSeq ?? 0);
console.log(`\x1b[90m[Init] Listening for new events starting from event sequence #${lastSeq}...\x1b[0m\n`);

function pollEvents() {
  try {
    const rows = store.db.prepare("SELECT seq, run_id, kind, data, at FROM events WHERE seq > ? ORDER BY seq ASC").all(lastSeq);
    for (const row of rows) {
      lastSeq = Number(row.seq);
      const time = new Date(Number(row.at)).toLocaleTimeString();
      const kind = String(row.kind);
      const runId = String(row.run_id).slice(0, 8);
      const data = JSON.parse(String(row.data)) as Record<string, unknown>;

      if (kind === "a2a_message") {
        const msg = data as unknown as { sender: string; recipient: string; messageType: string; payload: Record<string, unknown> };
        console.log(`\x1b[36m[${time}] [A2A BUS]\x1b[0m ${msg.sender} ➔ ${msg.recipient} | \x1b[1m${msg.messageType}\x1b[0m`);
        if (msg.payload && Object.keys(msg.payload).length > 0) {
          console.log(`   \x1b[90mPayload: ${JSON.stringify(msg.payload).slice(0, 140)}...\x1b[0m\n`);
        }
        continue;
      }

      let color = "\x1b[32m"; // green
      if (kind.includes("step_started")) color = "\x1b[33m"; // yellow
      if (kind.includes("reply_received")) color = "\x1b[35m"; // magenta
      if (kind.includes("held") || kind.includes("escalated") || kind.includes("failed")) color = "\x1b[31m"; // red
      if (kind.includes("approved")) color = "\x1b[34m"; // blue

      console.log(`${color}[${time}] [RUN:${runId}] [${kind.toUpperCase()}]\x1b[0m`);

      if (kind === "step_started") {
        console.log(`   \x1b[1mAgent Active:\x1b[0m ${data.stage} (Job: ${data.jobId?.toString().slice(0, 8)})`);
      } else if (kind === "reply_received") {
        console.log(`   \x1b[1mInbound Prospect Reply:\x1b[0m "${data.text}"`);
      } else if (kind === "draft_generated" || kind === "created") {
        const run = store.get(String(row.run_id));
        if (run.draft) {
          console.log(`   \x1b[1mDraft Subject:\x1b[0m ${run.draft.subject}`);
          console.log(`   \x1b[1mDraft Preview:\x1b[0m ${run.draft.body.slice(0, 180)}...`);
        }
      } else if (kind === "review_completed") {
        console.log(`   \x1b[1mCompliance Decision:\x1b[0m ${data.decision} - ${data.summary}`);
      } else if (kind === "deliverability_checked") {
        console.log(`   \x1b[1mDeliverability:\x1b[0m ${data.decision} - ${data.summary}`);
      } else if (kind === "approved") {
        console.log(`   \x1b[1mOperator Approval:\x1b[0m Approved by ${data.operator ?? "operator"}`);
      } else if (kind === "simulated_dispatch") {
        console.log(`   \x1b[1mDispatch Status:\x1b[0m Ready in simulated outbox (externalDelivery=false)`);
      }
      console.log("");
    }
  } catch {
    // Ignore brief read locks
  }
}

// Poll every 500ms
setInterval(pollEvents, 500);
