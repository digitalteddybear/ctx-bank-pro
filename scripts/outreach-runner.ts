import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { ConfigurableModel, FixtureModel } from "../src/lib/server/outreach/models";
import { refreshSources, seedFixtureSources, usableSources } from "../src/lib/server/outreach/sources";

const live = process.argv.includes("--live");
const worker = process.argv.includes("--worker");
const dbPath = process.env.CTX_OUTREACH_DB_PATH ?? (worker ? path.join(process.cwd(), "data/generated/outreach/workflows.sqlite") : path.join(mkdtempSync(path.join(os.tmpdir(), "asp-outreach-")), "demo.sqlite"));
const store = new OutreachStore(dbPath);
const engine = new OutreachEngine(store, live ? new ConfigurableModel() : new FixtureModel());
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
try {
  if (worker) {
    console.log(JSON.stringify({ worker: true, inference: engine.model.mode, dbPath, externalDispatch: false }));
    while (!stopping) {
      const attempted = Number(store.setting("source-refresh-attempt") ?? 0);
      if (Date.now() - attempted > 3600000) {
        store.setSetting("source-refresh-attempt", String(Date.now()));
        await refreshSources(store);
      }
      if (!await engine.tick()) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } else {
    if (!live && !store.sourceList().length) seedFixtureSources(store);
    if (live) usableSources(store, "live");
    let run = engine.create({ id: "synthetic-alex", name: "Alex Example", email: "alex@example.test", permission: "granted", facts: [{ text: "Synthetic prospect requested a conversation about private-market interests.", source: "synthetic-profile" }] });
    const drain = async () => { for (let i = 0; i < 30 && await engine.tick(); i++); };
    await drain(); run = store.get(run.id);
    if (run.status !== "awaiting_approval" || !run.draft) throw new Error(`Initial review did not pass: ${run.status}`);
    engine.approve(run.id, run.draft.hash, "scenario-runner-test-approval"); await drain();
    engine.reply(run.id, "demo-interested", "I am interested in discussing my objectives."); await drain(); run = store.get(run.id);
    if (run.status !== "awaiting_approval" || !run.draft) throw new Error(`Reply review did not pass: ${run.status}`);
    engine.approve(run.id, run.draft.hash, "scenario-runner-test-approval"); await drain();
    engine.reply(run.id, "demo-booking", "Please send me the booking calendar."); await drain(); run = store.get(run.id);
    if (run.status !== "awaiting_approval" || !run.draft) throw new Error(`Booking review did not pass: ${run.status}`);
    engine.approve(run.id, run.draft.hash, "scenario-runner-test-approval"); await drain();
    engine.booking(run.id, { eventId: "demo-confirmation", bookingId: "sim-booking-1", sequence: 1, startsAt: new Date(Date.now() + 86400000).toISOString(), status: "confirmed" });
    console.log(JSON.stringify({ inference: engine.model.mode, simulationOnly: true, dbPath, run: store.get(run.id), events: store.events(run.id) }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error && !live ? error.message : "Live evaluation unavailable or held. Configure models and reviewed non-fixture sources; inspect the persisted run report. No fixture fallback was used.");
  process.exitCode = 1;
} finally { store.close(); }
