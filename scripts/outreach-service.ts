import { ensureOutreachWorker, stopOutreachWorker } from "../src/lib/server/outreach/runtime";
process.env.CTX_WORKER_MODE = "worker";
const state = ensureOutreachWorker();
console.log(JSON.stringify({ service: "outreach-worker", started: state.started }));
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    stopOutreachWorker();
    console.log(JSON.stringify({ service: "outreach-worker", stopping: true }));
    setTimeout(() => process.exit(0), 15_000);
  });
}
