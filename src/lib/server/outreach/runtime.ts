import path from "node:path";
import { OutreachStore } from "./store";
import { OutreachEngine } from "./engine";
import { ConfigurableModel, FixtureModel } from "./models";
import { seedFixtureSources } from "./sources";

let singleton: OutreachStore | undefined;
type WorkerState = { started: boolean; busy: boolean; timer?: ReturnType<typeof setInterval> };
const runtime = globalThis as typeof globalThis & { __ctxOutreachWorker?: WorkerState };

export function outreachStore() {
  singleton ??= new OutreachStore(process.env.CTX_OUTREACH_DB_PATH ?? path.join(process.cwd(), "data/generated/outreach/workflows.sqlite"));
  return singleton;
}

/** Boot the lightweight in-process worker when the dashboard first uses Agents. */
export function ensureOutreachWorker() {
  const store = outreachStore();
  const state = runtime.__ctxOutreachWorker ??= { started: false, busy: false };
  if (state.started) return state;
  state.started = true;
  if (!store.sourceList().length) seedFixtureSources(store);
  const fixture = new OutreachEngine(store, new FixtureModel());
  const live = new OutreachEngine(store, new ConfigurableModel());
  state.timer = setInterval(() => {
    if (state.busy) return;
    state.busy = true;
    void (async () => {
      try {
        store.setSetting("worker-heartbeat", String(Date.now()));
        for (let i = 0; i < 12; i++) {
          const worked = await fixture.tick();
          if (!worked) break;
        }
        if (process.env.CTX_OUTREACH_MODEL_URL && process.env.CTX_OUTREACH_MODEL_KEY) await live.tick();
      } catch {
        store.event("operations", "internal_worker_error", { message: "Worker cycle failed; queued work remains persisted" });
      } finally { state.busy = false; }
    })();
  }, 350);
  return state;
}

export function outreachEngine(mode: "fixture" | "live") {
  ensureOutreachWorker();
  return new OutreachEngine(outreachStore(), mode === "live" ? new ConfigurableModel() : new FixtureModel());
}
