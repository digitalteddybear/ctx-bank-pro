import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import {
  calculateDispatchPacingDelay,
  checkBusinessHoursLock,
  sendingWindow,
  PACING_CONFIG,
} from "../src/lib/server/outreach/scheduler";
import { cleanReplyBody } from "../src/lib/server/outreach/transport/imap";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { FixtureModel } from "../src/lib/server/outreach/models";

test("B1: SQLite WAL mode and busy_timeout are enforced", () => {
  const testDbPath = path.join(process.cwd(), "data/generated/outreach/wal-test.sqlite");
  fs.mkdirSync(path.dirname(testDbPath), { recursive: true });

  const store = new OutreachStore(testDbPath);
  const journalMode = store.db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
  const busyTimeout = store.db.prepare("PRAGMA busy_timeout").get() as { timeout: number };

  assert.equal(journalMode.journal_mode.toLowerCase(), "wal");
  assert.equal(busyTimeout.timeout, 5000);

  // Clean up
  try {
    fs.unlinkSync(testDbPath);
    fs.unlinkSync(`${testDbPath}-wal`);
    fs.unlinkSync(`${testDbPath}-shm`);
  } catch {
    // Ignore cleanup errors
  }
});

test("B2: Business hours lock restricts sending strictly to 08:30 - 17:30 UK time", () => {
  // 1. Monday at 09:00 UTC (10:00 BST or 09:00 GMT - within window)
  const mondayMorning = new Date("2026-11-02T10:00:00Z").getTime();
  const windowMorning = checkBusinessHoursLock(mondayMorning);
  assert.equal(windowMorning.open, true);
  assert.equal(windowMorning.weekday, "Mon");

  // 2. Saturday (weekend - must be closed)
  const saturday = new Date("2026-11-07T12:00:00Z").getTime();
  const windowSaturday = checkBusinessHoursLock(saturday);
  assert.equal(windowSaturday.open, false);
  assert.ok(windowSaturday.reason?.includes("Weekend"));

  // 3. Weekday early morning (06:00 UK - must be closed)
  const weekdayNight = new Date("2026-11-02T06:00:00Z").getTime();
  const windowNight = checkBusinessHoursLock(weekdayNight);
  assert.equal(windowNight.open, false);
  assert.ok(windowNight.reason?.includes("Pre-market"));

  // 4. Weekday late evening (20:00 UK - must be closed)
  const weekdayLate = new Date("2026-11-02T20:00:00Z").getTime();
  const windowLate = checkBusinessHoursLock(weekdayLate);
  assert.equal(windowLate.open, false);
  assert.ok(windowLate.reason?.includes("Post-market"));
});

test("B2: Pacing queue paces 135 dispatches across 5-6 hours with 45-90s human jitter", () => {
  // Test lower and upper bounds of randomized jitter
  const minDelay = calculateDispatchPacingDelay(135, 5.5 * 3600 * 1000, () => 0);
  const maxDelay = calculateDispatchPacingDelay(135, 5.5 * 3600 * 1000, () => 1);
  const avgDelay = calculateDispatchPacingDelay(135, 5.5 * 3600 * 1000, () => 0.5);

  // Minimum delay must be at least 45 seconds (45,000 ms) to avoid spam filters
  assert.ok(minDelay >= 45_000, `minDelay (${minDelay}) should be >= 45,000ms`);
  assert.ok(maxDelay <= 200_000, `maxDelay (${maxDelay}) should be reasonable (<200,000ms)`);
  // Average delay should be close to ~146 seconds (~146,666 ms)
  assert.ok(avgDelay >= 140_000 && avgDelay <= 155_000, `avgDelay (${avgDelay}) should be ~146,000ms`);
});

test("B3: Inbound reply normalization strips quotes and preserves clean message text", () => {
  const quotedReply = `Hi Dylan,

I would like to arrange an introductory call regarding precious metals.

On Mon, Nov 2, 2026 at 10:15 AM Dylan <dylan@aspinvest.co.uk> wrote:
> Hello,
> We are following up regarding your recorded private-market profile...
> ASP Private Capital`;

  const clean = cleanReplyBody(quotedReply);
  assert.equal(clean, "Hi Dylan,\n\nI would like to arrange an introductory call regarding precious metals.");
});
