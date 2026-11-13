import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sandboxProspect } from "../src/lib/server/outreach/types";
import { getControlledTestRecords } from "../src/lib/server/outreach/test-boundary";
import { prepare100Prospects, run100ConversationsSimulation, build100Scenarios } from "../src/lib/server/outreach/sandbox-simulator";

test("sandboxProspect schema automatically populates required regulatory defaults", () => {
  const minimalProspect = {
    id: "lead-test-min",
    name: "Test Investor",
    email: "investor@example.test",
    permission: "unknown" as const,
    facts: [{ text: "Investor fit tier 1", source: "test" }],
    dossier: "# Test Dossier\n- Investor Tier: Qualified",
  };

  const parsed = sandboxProspect.parse(minimalProspect);
  assert.equal(parsed.subscriberType, "individual", "Defaults subscriberType to individual");
  assert.equal(parsed.jurisdiction, "UK", "Defaults jurisdiction to UK");
  assert.equal(parsed.lawfulBasis, "consent", "Defaults lawfulBasis to consent");
  assert.equal(parsed.pecrCondition, "consent", "Defaults pecrCondition to consent");
  assert.equal(parsed.permission, "unknown");
});

test("sandbox simulator strictly isolates against live workflows.sqlite and controlled test recipients", async () => {
  const liveDbPath = path.resolve(process.cwd(), "data/generated/outreach/workflows.sqlite");

  // Attempting to direct simulation to live workflows.sqlite must throw SANDBOX_ISOLATION_VIOLATION
  await assert.rejects(
    async () => {
      await run100ConversationsSimulation({
        leadCount: 1,
        concurrency: 1,
        dbPath: liveDbPath,
      });
    },
    (err: Error) => {
      assert.match(err.message, /SANDBOX_ISOLATION_VIOLATION/);
      return true;
    },
    "Must throw SANDBOX_ISOLATION_VIOLATION when attempting to target live workflows.sqlite",
  );

  // Controlled test recipient addresses must never appear in prepared prospects
  const controlledEmails = new Set(
    getControlledTestRecords().map((r) => r.email.toLowerCase().trim()),
  );
  const scenarios = build100Scenarios().slice(0, 20);
  const prospects = await prepare100Prospects(scenarios);
  for (const p of prospects) {
    assert.equal(
      controlledEmails.has(p.email.toLowerCase().trim()),
      false,
      `Controlled test email ${p.email} leaked into sandbox prospects`,
    );
  }
});

test("sandbox simulator completes 14-lead multi-cohort slice with 100% air-gap and safety verification", async () => {
  // Test a multi-cohort slice across cohorts 1-7
  const report = await run100ConversationsSimulation({
    leadCount: 14,
    concurrency: 4,
  });

  assert.equal(report.summary.totalConversations, 14);
  assert.equal(report.airGapAudit.airGapVerified, true);
  assert.equal(report.airGapAudit.realSmtpCalls, 0);
  assert.equal(report.airGapAudit.realHubspotCalls, 0);
  assert.equal(report.airGapAudit.realCalCalls, 0);
  assert.equal(report.airGapAudit.externalDeliveryLeaks, 0);
  assert.equal(report.statusCounts.failed, 0);
  assert.equal(report.summary.allPassed, true);
});
