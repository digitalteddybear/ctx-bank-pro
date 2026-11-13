import path from "node:path";
import { OutreachStore } from "./store";

/**
 * Attach singleton to globalThis so it survives Next.js dev-mode HMR.
 * Module-scope `let` is reset on every re-evaluation, leaking SQLite
 * connections and WAL locks that eventually freeze webpack compilation.
 */
const g = globalThis as typeof globalThis & { __ctxOutreachStore?: OutreachStore };
export function outreachStore() {
  g.__ctxOutreachStore ??= new OutreachStore(process.env.CTX_OUTREACH_DB_PATH ?? path.join(process.cwd(), "data/generated/outreach/workflows.sqlite"));
  return g.__ctxOutreachStore;
}

/** Inspect an existing store without creating or migrating a database. */
export function currentOutreachStore(){return g.__ctxOutreachStore;}
