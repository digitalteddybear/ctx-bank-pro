import { reconcilePendingBookings } from './cal-reconciliation';
import { materializeCampaignRuns, processProductionDelivery, processCrmJobs } from './production-delivery';
import { loadRuntimeSender, loadProviderKeys, loadIntegrationSettings } from './runtime-settings';
import { processDueCallbacks } from "./callbacks";
import { outreachStore } from "./store-instance";
export { outreachStore } from "./store-instance";
import { OutreachEngine } from "./engine";
import { ConfigurableModel, FixtureModel, outreachModelConfig } from "./models";
import { seedFixtureSources, refreshSources } from "./sources";
import { startPersistentImapListener } from "./transport/imap";

type WorkerState = { lastOperationsAt?:number; sourceBusy?:boolean; sourceCheckAt?:number; configRevision?:string; started: boolean; busy: boolean; timer?: ReturnType<typeof setInterval>; imap?: ReturnType<typeof startPersistentImapListener> };
const runtime = globalThis as typeof globalThis & { __ctxOutreachWorker?: WorkerState };

/** Boot the lightweight in-process worker when the dashboard first uses Agents. */
export function ensureOutreachWorker() {
  const store = outreachStore();
  const state = runtime.__ctxOutreachWorker ??= { started: false, busy: false };
  if (state.started || process.env.CTX_WORKER_MODE === "external") return state;
  state.started = true;
  loadProviderKeys();
  state.configRevision=loadRuntimeSender()+loadIntegrationSettings();
  if (!store.sourceList().length) seedFixtureSources(store);
  const fixture = new OutreachEngine(store, new FixtureModel());
  const live = new OutreachEngine(store, new ConfigurableModel());
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    state.imap = startPersistentImapListener({
      store,
      engine: live,
      pollIntervalMs: 30_000,
      liveSend: process.env.CTX_LIVE_EMAIL_DISPATCH === "true",
      liveCrm: process.env.HUBSPOT_WRITES_ENABLED === "true",
    });
  }
  state.timer = setInterval(() => {
    if (state.busy) return;
    state.busy = true;
    void (async () => {
      try {
        const requestedSourceRefresh=Number(store.setting("source-refresh-request")??0);
        if(!state.sourceBusy&&(Date.now()-(state.sourceCheckAt??0)>3600000||requestedSourceRefresh>(state.sourceCheckAt??0))){
          state.sourceBusy=true;state.sourceCheckAt=Date.now();
          void refreshSources(store,requestedSourceRefresh>0,requestedSourceRefresh>0).catch(()=>store.event("sources","monitor_failed",{})).finally(()=>{state.sourceBusy=false;});
        }
        loadProviderKeys();
        const configRevision=loadRuntimeSender()+loadIntegrationSettings();
        if(configRevision!==state.configRevision){
          state.imap?.stop();
          state.imap=undefined;
          state.configRevision=configRevision;
          if(process.env.GMAIL_USER&&process.env.GMAIL_APP_PASSWORD)state.imap=startPersistentImapListener({store,engine:live,pollIntervalMs:30000,liveSend:process.env.CTX_LIVE_EMAIL_DISPATCH==="true",liveCrm:process.env.HUBSPOT_WRITES_ENABLED==="true"});
        }
        store.setSetting("worker-heartbeat", String(Date.now()));
        processDueCallbacks(store);
        if(Date.now()-(state.lastOperationsAt??0)>2000){
          state.lastOperationsAt=Date.now();
          await materializeCampaignRuns(store);
          await processProductionDelivery(store);
          await processCrmJobs(store);
          await reconcilePendingBookings(store);
        }
        for (let i = 0; i < 12; i++) {
          const worked = await fixture.tick();
          if (!worked) break;
        }
        if (store.setting("lead-outreach-settings") || outreachModelConfig().ready) await live.tick();
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

export function stopOutreachWorker() {
  const state=runtime.__ctxOutreachWorker;
  if(!state)return;
  if(state.timer)clearInterval(state.timer);
  state.imap?.stop();
  state.started=false;
}
