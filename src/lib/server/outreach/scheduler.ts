import { randomUUID } from "node:crypto";
import { OutreachStore } from "./store";

// Seven full days at the requested 135/day pace cover 945 of 949 records;
// the final four remain schedulable on day eight.
export const CAMPAIGN_RAMP = [135, 135, 135, 135, 135, 135, 135, 4] as const;
export const DAILY_EMAIL_CAP = 135;

export const PACING_CONFIG = {
  targetDispatches: 135,
  targetDurationMs: 5.5 * 3600 * 1000, // 5.5 hours = 19,800,000 ms
  minJitterSeconds: 45,
  maxJitterSeconds: 90,
  windowStartMinutes: 510, // 08:30 UK time
  windowEndMinutes: 1050,  // 17:30 UK time
} as const;

const london = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function sendingWindow(now: number) {
  const parts = Object.fromEntries(london.formatToParts(now).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, open: !["Sat", "Sun"].includes(parts.weekday) && minutes >= PACING_CONFIG.windowStartMinutes && minutes < PACING_CONFIG.windowEndMinutes };
}

/**
 * Calculates humanized pacing delay: 135 dispatches across 5-6 hours (~146s base interval),
 * randomized with 45-90s jitter to avoid robotic regularity.
 */
export function calculateDispatchPacingDelay(
  targetDispatches: number = PACING_CONFIG.targetDispatches,
  targetDurationMs: number = PACING_CONFIG.targetDurationMs,
  random = Math.random
): number {
  const baseIntervalMs = Math.floor(targetDurationMs / Math.max(1, targetDispatches)); // ~146,666 ms
  const jitterRangeMs = (PACING_CONFIG.maxJitterSeconds - PACING_CONFIG.minJitterSeconds) * 1000; // 45,000 ms
  const jitterMs = PACING_CONFIG.minJitterSeconds * 1000 + Math.floor(random() * jitterRangeMs); // 45,000 - 90,000 ms
  const centeredVariance = jitterMs - (PACING_CONFIG.minJitterSeconds * 1000 + jitterRangeMs / 2);
  return Math.max(45_000, Math.round(baseIntervalMs + centeredVariance));
}

export function checkBusinessHoursLock(now = Date.now()): {
  open: boolean;
  ukTime: string;
  weekday: string;
  day: string;
  minutes: number;
  reason?: string;
} {
  const parts = Object.fromEntries(london.formatToParts(now).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const isWeekend = ["Sat", "Sun"].includes(parts.weekday);
  const isWithinHours = minutes >= PACING_CONFIG.windowStartMinutes && minutes < PACING_CONFIG.windowEndMinutes;
  const open = !isWeekend && isWithinHours;

  let reason: string | undefined;
  if (isWeekend) {
    reason = `Closed: Weekend (${parts.weekday}). Dispatches locked until Monday 08:30 UK time.`;
  } else if (minutes < PACING_CONFIG.windowStartMinutes) {
    reason = `Closed: Pre-market (${parts.hour}:${parts.minute} UK). Dispatches locked until 08:30 UK time.`;
  } else if (minutes >= PACING_CONFIG.windowEndMinutes) {
    reason = `Closed: Post-market (${parts.hour}:${parts.minute} UK). Dispatches locked until next business day at 08:30 UK time.`;
  }

  return {
    open,
    ukTime: `${parts.hour}:${parts.minute} UK`,
    weekday: parts.weekday,
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes,
    reason,
  };
}
export type DeliveryKind = "initial" | "reply" | "followup";
export type DeliveryState = "queued" | "sending" | "accepted" | "uncertain" | "cancelled";
export type ScheduledDelivery = { id: string; runId: string; sender: string; kind: DeliveryKind; state: DeliveryState; messageId: string; owner?: string; lease?: number };

/** Persistent sender budget and delivery claims. No network I/O occurs in SQLite transactions. */
export class OutreachScheduler {
  constructor(readonly store: OutreachStore) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS delivery_queue (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, sender TEXT NOT NULL, kind TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', message_id TEXT NOT NULL UNIQUE,
        due INTEGER NOT NULL, owner TEXT, lease INTEGER, error TEXT, accepted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS delivery_ready ON delivery_queue(state,due);
      CREATE TABLE IF NOT EXISTS sender_days (
        sender TEXT NOT NULL, day TEXT NOT NULL, reserved INTEGER NOT NULL DEFAULT 0,
        starts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(sender,day)
      );
      CREATE TABLE IF NOT EXISTS sender_pacing (sender TEXT PRIMARY KEY, next_at INTEGER NOT NULL);
    `);
  }
  enqueue(input: { id: string; runId: string; sender: string; kind: DeliveryKind }, now = Date.now()) {
    const sender = input.sender.trim().toLowerCase();
    const messageId = `<ctx-${Buffer.from(input.id).toString("hex")}@${sender.split("@")[1]}>`;
    this.store.db.prepare("INSERT OR IGNORE INTO delivery_queue(id,run_id,sender,kind,message_id,due) VALUES(?,?,?,?,?,?)").run(input.id, input.runId, sender, input.kind, messageId, now);
    const row = this.store.db.prepare("SELECT * FROM delivery_queue WHERE id=?").get(input.id)!;
    if (row.run_id !== input.runId || row.sender !== sender || row.kind !== input.kind) throw new Error("Delivery ID reused with different input");
    return messageId;
  }
  /** Expired in-flight SMTP is uncertain, never automatically returned to the send queue. */
  recover(now = Date.now()) {
    this.store.db.prepare("UPDATE delivery_queue SET state='uncertain',error='Worker stopped during delivery; reconcile before retry' WHERE state='sending' AND lease<?").run(now);
  }
  claim(sender: string, rampDay: number, now = Date.now(), random = Math.random): ScheduledDelivery | undefined {
    const window = sendingWindow(now);
    if (!window.open) return;
    if (!Number.isInteger(rampDay) || rampDay < 0 || rampDay >= CAMPAIGN_RAMP.length) throw new Error("Invalid campaign sending day");
    const normalized = sender.trim().toLowerCase();
    return this.store.transaction(() => {
      this.recover(now);
      if (this.store.setting("paused") === "true" || this.store.setting("campaign-paused") === "true") return;
      const pace = this.store.db.prepare("SELECT next_at FROM sender_pacing WHERE sender=?").get(normalized);
      if (pace && Number(pace.next_at) > now) return;
      this.store.db.prepare("INSERT OR IGNORE INTO sender_days(sender,day) VALUES(?,?)").run(normalized, window.day);
      const budget = this.store.db.prepare("SELECT reserved,starts FROM sender_days WHERE sender=? AND day=?").get(normalized, window.day)!;
      if (Number(budget.reserved) >= DAILY_EMAIL_CAP) return;
      const rows = this.store.db.prepare("SELECT * FROM delivery_queue WHERE sender=? AND state='queued' AND due<=? ORDER BY CASE kind WHEN 'reply' THEN 0 WHEN 'followup' THEN 1 ELSE 2 END,due LIMIT 250").all(normalized, now);
      for (const row of rows) {
        if (row.kind === "initial" && Number(budget.starts) >= CAMPAIGN_RAMP[rampDay]) continue;
        const run = this.store.get(String(row.run_id));
        if(run.campaignId&&this.store.setting("campaign-paused:"+run.campaignId)==="true")continue;
        if (this.store.isSuppressed(run.prospect.email) || run.humanManaged || ["booked", "suppressed", "paused", "held", "escalated", "failed"].includes(run.status)) {
          this.store.db.prepare("UPDATE delivery_queue SET state='cancelled' WHERE id=?").run(row.id);
          continue;
        }
        const owner = randomUUID();
        const lease = now + 120_000;
        this.store.db.prepare("UPDATE delivery_queue SET state='sending',owner=?,lease=? WHERE id=?").run(owner, lease, row.id);
        this.store.db.prepare("UPDATE sender_days SET reserved=reserved+1,starts=starts+? WHERE sender=? AND day=?").run(row.kind === "initial" ? 1 : 0, normalized, window.day);
        // Starts distributed over 5-6 hours with randomized 45-90s human pacing jitter
        const targetDispatches = row.kind === "initial" ? CAMPAIGN_RAMP[rampDay] : DAILY_EMAIL_CAP;
        const delay = calculateDispatchPacingDelay(targetDispatches, 5.5 * 3600 * 1000, random);
        this.store.db.prepare("INSERT INTO sender_pacing VALUES(?,?) ON CONFLICT(sender) DO UPDATE SET next_at=excluded.next_at").run(normalized, now + delay);
        return { id: String(row.id), runId: String(row.run_id), sender: normalized, kind: row.kind as DeliveryKind, state: "sending", messageId: String(row.message_id), owner, lease };
      }
    });
  }
  finish(delivery: ScheduledDelivery, outcome: "accepted" | "uncertain", now = Date.now(), error?: string) {
    const changed = this.store.db.prepare("UPDATE delivery_queue SET state=?,accepted_at=?,error=? WHERE id=? AND owner=? AND state='sending'").run(outcome, outcome === "accepted" ? now : null, error?.slice(0,500) ?? null, delivery.id, delivery.owner ?? "");
    if (!changed.changes) throw new Error("Delivery claim no longer owned");
  }
}
