import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Run, RegulatorySource, Stage } from "./types";

export const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export type InflectionAlert = { id: string; severity: "critical" | "warning" | "healthy"; title: string; service: string; state: "firing" | "acknowledged" | "resolved"; at: string };
export class OutreachStore {
  readonly db: DatabaseSync;
  private transactionDepth=0;
  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    const version=Number(this.db.prepare("PRAGMA user_version").get()?.user_version??0);
    if(version>2){this.db.close();throw new Error("This outreach database requires a newer CTX version.");}
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, revision INTEGER NOT NULL, stage TEXT NOT NULL, due INTEGER NOT NULL, lease INTEGER NOT NULL DEFAULT 0, owner TEXT, attempts INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'queued');
      CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(state,due,lease);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_versions (hash TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS suppressed (email TEXT PRIMARY KEY, reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outreach_preferences (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inflection_alerts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`);
    this.migrateProductionSchema();
  }
  private migrateProductionSchema(){
    this.db.exec("BEGIN IMMEDIATE");
    try{
      this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS campaign_runs(lead_id TEXT NOT NULL,campaign_id TEXT NOT NULL,run_id TEXT NOT NULL UNIQUE,PRIMARY KEY(lead_id,campaign_id)); CREATE TABLE IF NOT EXISTS crm_delivery_jobs(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',due INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,error TEXT); CREATE INDEX IF NOT EXISTS crm_delivery_ready ON crm_delivery_jobs(state,due,lease);");
      this.db.prepare("INSERT OR IGNORE INTO schema_migrations VALUES(2,?)").run(Date.now());
      this.db.exec("PRAGMA user_version=2; COMMIT;");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  transaction<T>(fn: () => T): T {
    const depth=this.transactionDepth++,savepoint="ctx_nested_"+depth;
    try{
      this.db.exec(depth?"SAVEPOINT "+savepoint:"BEGIN IMMEDIATE");
      try{
        const result=fn();
        this.db.exec(depth?"RELEASE SAVEPOINT "+savepoint:"COMMIT");
        return result;
      }catch(error){
        this.db.exec(depth?"ROLLBACK TO SAVEPOINT "+savepoint:"ROLLBACK");
        if(depth)this.db.exec("RELEASE SAVEPOINT "+savepoint);
        throw error;
      }
    }finally{this.transactionDepth--;}
  }
  get(id: string): Run {
    const row = this.db.prepare("SELECT data FROM runs WHERE id=?").get(id);
    if (!row) throw new Error("Run not found");
    return JSON.parse(String(row.data)) as Run;
  }
  list(): Run[] { return this.db.prepare("SELECT data FROM runs ORDER BY rowid DESC").all().map(row => JSON.parse(String(row.data))); }
  save(run: Run) { this.db.prepare("INSERT INTO runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(run.id, JSON.stringify(run)); }
  recordEmailDelivery(runId:string,eventId:string,details:{from:string;fromName:string;to:string;subject:string;sentAt:string;externalMessageId:string}) {
    return this.transaction(()=>{
      const run=this.get(runId);
      const message=run.transcript.find(item=>item.direction==="outbound"&&item.eventId===eventId);
      if(!message) throw new Error("Outbound transcript entry not found for accepted email");
      if (message.deliveryStatus === "sent") {
        if (message.externalMessageId !== details.externalMessageId) throw new Error("Outbound transcript already has a different accepted message ID");
        return run;
      }
      Object.assign(message,details,{deliveryStatus:"sent" as const});
      this.save(run);
      this.event(runId,"live_email_delivered",{eventId,from:details.from,to:details.to,subject:details.subject,sentAt:details.sentAt,externalMessageId:details.externalMessageId});
      return run;
    });
  }
  event(id: string, kind: string, data: unknown) { this.db.prepare("INSERT INTO events(run_id,kind,data,at) VALUES (?,?,?,?)").run(id, kind, JSON.stringify(data), Date.now()); }
  events(id: string) { return this.db.prepare("SELECT seq,kind,data,at FROM events WHERE run_id=? ORDER BY seq").all(id).map(row => ({ seq: Number(row.seq), kind: String(row.kind), at: Number(row.at), data: JSON.parse(String(row.data)) as unknown })); }
  enqueue(run: Run, stage: Stage, delay = 0) {
    this.db.prepare("INSERT INTO jobs(id,run_id,revision,stage,due) VALUES (?,?,?,?,?)").run(randomUUID(), run.id, run.revision, stage, Date.now() + delay);
    run.next = stage;
    run.status = "queued";
    this.save(run);
  }
  cancel(id: string) { this.db.prepare("UPDATE jobs SET state='cancelled' WHERE run_id=? AND state IN ('queued','running')").run(id); }
  setting(key: string) { return this.db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value; }
  setSetting(key: string, value: string) { this.db.prepare("INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value); }
  alerts(): InflectionAlert[] { return this.db.prepare("SELECT data FROM inflection_alerts ORDER BY rowid DESC").all().map(row => JSON.parse(String(row.data)) as InflectionAlert); }
  alert(id: string): InflectionAlert { const row = this.db.prepare("SELECT data FROM inflection_alerts WHERE id=?").get(id); if (!row) throw new Error("Alert not found"); return JSON.parse(String(row.data)) as InflectionAlert; }
  saveAlert(alert: InflectionAlert) { this.db.prepare("INSERT INTO inflection_alerts VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(alert.id, JSON.stringify(alert)); }
  isSuppressed(email: string) { return Boolean(this.db.prepare("SELECT email FROM suppressed WHERE email=?").get(email.toLowerCase())); }
  sourceList(): RegulatorySource[] { return this.db.prepare("SELECT data FROM sources").all().map(row => JSON.parse(String(row.data))); }
  saveSource(source: RegulatorySource) {
    this.db.prepare("INSERT INTO sources VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(source.id, JSON.stringify(source));
    this.db.prepare("INSERT OR IGNORE INTO source_versions VALUES (?,?)").run(source.hash, JSON.stringify(source));
  }
  receipt(id: string, payload: unknown): boolean {
    const digest = hash(payload), row = this.db.prepare("SELECT payload_hash FROM receipts WHERE id=?").get(id);
    if (row) { if (row.payload_hash !== digest) throw new Error("Event ID reused with different payload"); return false; }
    this.db.prepare("INSERT INTO receipts VALUES (?,?)").run(id, digest); return true;
  }
  clearSandboxRuns(): number {
    return this.transaction(() => {
      const sandboxRuns = this.list().filter(r => r.sandbox);
      for (const r of sandboxRuns) {
        this.db.prepare("DELETE FROM jobs WHERE run_id=?").run(r.id);
        this.db.prepare("DELETE FROM events WHERE run_id=?").run(r.id);
        this.db.prepare("DELETE FROM outbox WHERE run_id=?").run(r.id);
        this.db.prepare("DELETE FROM runs WHERE id=?").run(r.id);
      }
      return sandboxRuns.length;
    });
  }
  clearAllRuns(): number {
    return this.transaction(() => {
      const all = this.list();
      this.db.prepare("DELETE FROM jobs").run();
      this.db.prepare("DELETE FROM events WHERE run_id != 'sources' AND run_id != 'a2a-bus'").run();
      this.db.prepare("DELETE FROM outbox").run();
      this.db.prepare("DELETE FROM receipts").run();
      this.db.prepare("DELETE FROM runs").run();
      return all.length;
    });
  }
  close() { this.db.close(); }
}
