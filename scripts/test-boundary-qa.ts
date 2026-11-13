import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getControlledTestRecords,
  validateTestRecipientBoundary,
  registerOperatorTestRecipient,
} from "../src/lib/server/outreach/test-boundary";
import { isAllowlistedContact } from "../src/lib/server/integrations/hubspot-allowlist";

test("test-boundary: recognizes designated primary operator test record", () => {
  const records = getControlledTestRecords();
  assert.ok(records.length >= 1, "At least 1 controlled test record must be registered");
  const primary = records[0];
  assert.equal(primary.email, "digitalteddybear2002@gmail.com");
  assert.equal(primary.hubspotId, "908035561662");

  const validCheck = validateTestRecipientBoundary(primary.email, `lead-${primary.hubspotId}`);
  assert.equal(validCheck.isDesignatedTestRecipient, true);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.testRecord?.email, primary.email);
});

test("test-boundary: strictly rejects arbitrary email addresses", () => {
  const arbitraryEmails = [
    "attacker@evil.com",
    "random.user@external.com",
    "test@example.com",
    "dylan@otherdomain.com",
  ];

  for (const email of arbitraryEmails) {
    const result = validateTestRecipientBoundary(email);
    assert.equal(result.isDesignatedTestRecipient, false);
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("not a designated controlled test inbox"));
  }
});

test("test-boundary: rejects mismatched lead ID for designated test email", () => {
  const primaryEmail = "digitalteddybear2002@gmail.com";
  const mismatchedLeadId = "lead-111111111111";

  const result = validateTestRecipientBoundary(primaryEmail, mismatchedLeadId);
  assert.equal(result.isDesignatedTestRecipient, true);
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("does not match the designated HubSpot test record"));
});

test("test-boundary: allowlist integration respects designated test records and frozen cohort", () => {
  // Designated test contact must be recognized
  assert.equal(
    isAllowlistedContact("908035561662", "digitalteddybear2002@gmail.com"),
    true
  );

  // Mismatched test ID and test email must be denied
  assert.equal(
    isAllowlistedContact("908035561662", "wrong@email.com"),
    false
  );
  assert.equal(
    isAllowlistedContact("999999999999", "digitalteddybear2002@gmail.com"),
    false
  );

  // Arbitrary contact must be denied
  assert.equal(
    isAllowlistedContact("1234567890", "arbitrary@domain.com"),
    false
  );
});

test("test-boundary: registerOperatorTestRecipient allows dynamic operator test designation", () => {
  const designated = registerOperatorTestRecipient({
    email: "dylan.custom@aspinvest.co.uk",
    name: "Dylan Custom",
    hubspotId: "908035561662",
  });

  assert.equal(designated.email, "dylan.custom@aspinvest.co.uk");
  assert.equal(designated.name, "Dylan Custom");

  const check = validateTestRecipientBoundary("dylan.custom@aspinvest.co.uk", "lead-908035561662");
  assert.equal(check.isDesignatedTestRecipient, true);
  assert.equal(check.valid, true);

  assert.equal(
    isAllowlistedContact("908035561662", "dylan.custom@aspinvest.co.uk"),
    true
  );
});

test("lifecycle: reply sets ctx_status to Replied, strictly requiring calendar sync for Booked", async () => {
  const { startInteractiveDemo, simulateInboundDemoReply, confirmMeetingBooking } = await import(
    "../src/lib/server/outreach/demo-service"
  );

  // 1. Initialize demo with controlled test recipient
  const startResult = await startInteractiveDemo({
    liveSend: false,
    liveCrm: false,
    useLiveModel: false,
    prospectName: "Dylan Test",
    prospectEmail: "digitalteddybear2002@gmail.com",
    hubspotContactId: "908035561662",
    customSubject: "Private market inquiry",
    customBody: "Hello Dylan, regarding private market discussions across approved sectors. ASP Private Capital. Reply stop to opt out.",
  });

  assert.equal(startResult.ok, true);
  assert.ok(startResult.runId);

  // 2. Simulate prospect reply requesting a call
  const replyResult = await simulateInboundDemoReply(
    startResult.runId,
    "Hi Dylan, I would like to schedule a call to discuss precious metals allocations.",
    { liveSend: false, liveCrm: false }
  );

  assert.equal(replyResult.ok, true);
  assert.equal(replyResult.classification, "booking");
  // CRITICAL GOVERNANCE CHECK: Reply classification must NOT set workflow status to "booked"
  assert.notEqual(replyResult.run.status, "booked");

  // 3. Confirm Google Calendar meeting sync
  const bookingResult = await confirmMeetingBooking(startResult.runId, {
    liveCrm: false,
    startsAt: new Date(Date.now() + 86400000).toISOString(),
  });

  assert.equal(bookingResult.ok, true);
  assert.equal(bookingResult.booked, true);
  // ONLY after calendar event confirmation is status "booked"
  assert.equal(bookingResult.status, "booked");
  assert.equal(bookingResult.run.status, "booked");
  assert.ok(bookingResult.booking?.id);
});
