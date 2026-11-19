import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { OutreachStore, hash } from "../src/lib/server/outreach/store";
import { ActionAuthorizationEngine } from "../src/lib/server/governance/action-authorizer";
import type { ProposedAction } from "../src/lib/server/governance/action-contract";
import type { Run } from "../src/lib/server/outreach/types";

function createMockRun(overrides?: Partial<Run>): Run {
  return {
    id: randomUUID(),
    campaign: "relationship-reactivation",
    prospect: {
      id: "test-prospect-1",
      name: "Alex Taylor",
      email: "alex@example.test",
      permission: "granted",
      facts: [],
      subscriberType: "individual",
      jurisdiction: "UK",
      lawfulBasis: "consent",
      pecrCondition: "consent",
    },
    sandbox: true,
    mode: "human",
    inference: "fixture",
    synthetic: true,
    revision: 1,
    status: "awaiting_approval",
    next: "dispatch",
    transcript: [],
    intent: "initial",
    corrections: 0,
    draftCounter: 1,
    followups: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

test("Action Authorizer: denies execution for suppressed recipient", () => {
  const store = new OutreachStore(":memory:");
  const authorizer = new ActionAuthorizationEngine(store);

  // Suppress email
  store.db.prepare("INSERT INTO suppressed VALUES (?, ?)").run("alex@example.test", "User requested opt-out");

  const run = createMockRun();
  const payload = { subject: "Introduction", body: "Hello Alex" };
  const payloadHash = hash(payload);

  const action: ProposedAction = {
    id: randomUUID(),
    runId: run.id,
    agentId: "outreach",
    actionType: "outreach.send_initial",
    targetEntityId: "test-prospect-1",
    targetChannel: "email",
    recipientEmail: "alex@example.test",
    payload,
    payloadHash,
    evidenceCitations: [],
    proposedAt: Date.now(),
  };

  const result = authorizer.authorize(action, run);
  assert.equal(result.authorized, false);
  assert.equal(result.decision, "DENIED_SUPPRESSED");
  assert.ok(result.rejectionReason?.includes("permanent suppression"));
});

test("Action Authorizer: denies execution when opt-out appears in transcript", () => {
  const store = new OutreachStore(":memory:");
  const authorizer = new ActionAuthorizationEngine(store);

  const run = createMockRun({
    transcript: [
      {
        direction: "inbound",
        text: "Please unsubscribe me immediately.",
        eventId: "event-1",
      },
    ],
  });

  const payload = { subject: "Follow-up", body: "Checking in" };
  const action: ProposedAction = {
    id: randomUUID(),
    runId: run.id,
    agentId: "outreach",
    actionType: "outreach.send_followup",
    targetEntityId: "test-prospect-1",
    targetChannel: "email",
    recipientEmail: "alex@example.test",
    payload,
    payloadHash: hash(payload),
    evidenceCitations: [],
    proposedAt: Date.now(),
  };

  const result = authorizer.authorize(action, run);
  assert.equal(result.authorized, false);
  assert.equal(result.decision, "DENIED_OPT_OUT");
});

test("Action Authorizer: denies execution when human approval is missing in human mode", () => {
  const store = new OutreachStore(":memory:");
  const authorizer = new ActionAuthorizationEngine(store);

  const run = createMockRun({ approval: undefined });
  const payload = { subject: "Meeting Request", body: "Are you free?" };

  const action: ProposedAction = {
    id: randomUUID(),
    runId: run.id,
    agentId: "outreach",
    actionType: "outreach.send_initial",
    targetEntityId: "test-prospect-1",
    targetChannel: "email",
    recipientEmail: "alex@example.test",
    payload,
    payloadHash: hash(payload),
    evidenceCitations: [],
    proposedAt: Date.now(),
  };

  const result = authorizer.authorize(action, run);
  assert.equal(result.authorized, false);
  assert.equal(result.decision, "DENIED_MISSING_APPROVAL");
});

test("Action Authorizer: denies execution when payload hash does not match approval hash", () => {
  const store = new OutreachStore(":memory:");
  const authorizer = new ActionAuthorizationEngine(store);

  const approvedPayload = { subject: "Original", body: "Original text" };
  const run = createMockRun({
    approval: { actor: "dylan", draftHash: hash(approvedPayload) },
    review: {
      decision: "pass",
      summary: "Looks good",
      citations: [],
      draftHash: hash(approvedPayload),
      sourceFingerprint: "fp1",
      reviewedAt: Date.now(),
    },
  });

  // Tampered or modified payload after approval
  const tamperedPayload = { subject: "Original", body: "Tampered text!" };

  const action: ProposedAction = {
    id: randomUUID(),
    runId: run.id,
    agentId: "outreach",
    actionType: "outreach.send_initial",
    targetEntityId: "test-prospect-1",
    targetChannel: "email",
    recipientEmail: "alex@example.test",
    payload: tamperedPayload,
    payloadHash: hash(tamperedPayload),
    evidenceCitations: [],
    proposedAt: Date.now(),
  };

  const result = authorizer.authorize(action, run);
  assert.equal(result.authorized, false);
  assert.equal(result.decision, "DENIED_APPROVAL_HASH_MISMATCH");
  assert.ok(result.rejectionReason?.includes("Post-approval edit detected"));
});

test("Action Authorizer: denies duplicate action replay via idempotency receipts", () => {
  const store = new OutreachStore(":memory:");
  const authorizer = new ActionAuthorizationEngine(store);

  const payload = { subject: "Hello", body: "Valid email" };
  const payloadHash = hash(payload);

  const run = createMockRun({
    approval: { actor: "dylan", draftHash: payloadHash },
    review: {
      decision: "pass",
      summary: "Compliant",
      citations: [],
      draftHash: payloadHash,
      sourceFingerprint: "fp1",
      reviewedAt: Date.now(),
    },
  });

  const actionId = randomUUID();
  const action: ProposedAction = {
    id: actionId,
    runId: run.id,
    agentId: "outreach",
    actionType: "outreach.send_initial",
    targetEntityId: "test-prospect-1",
    targetChannel: "email",
    recipientEmail: "alex@example.test",
    payload,
    payloadHash,
    evidenceCitations: [],
    proposedAt: Date.now(),
  };

  // First authorization attempt -> Success
  const firstResult = authorizer.authorize(action, run);
  assert.equal(firstResult.authorized, true);
  assert.equal(firstResult.decision, "AUTHORIZED");

  // Duplicate replay attempt with same action ID -> Denied
  const replayResult = authorizer.authorize(action, run);
  assert.equal(replayResult.authorized, false);
  assert.equal(replayResult.decision, "DENIED_IDEMPOTENT_DUPLICATE");
});

test("Action Authorizer: approves compliant, hash-matched action and records audit event", () => {
  const store = new OutreachStore(":memory:");
  const authorizer = new ActionAuthorizationEngine(store);

  const payload = { subject: "Valid Pitch", body: "Compliant text with full evidence" };
  const payloadHash = hash(payload);

  const run = createMockRun({
    approval: { actor: "compliance_officer", draftHash: payloadHash },
    review: {
      decision: "pass",
      summary: "Fully vetted",
      citations: [],
      draftHash: payloadHash,
      sourceFingerprint: "fp1",
      reviewedAt: Date.now(),
    },
  });

  const action: ProposedAction = {
    id: randomUUID(),
    runId: run.id,
    agentId: "outreach",
    actionType: "outreach.send_initial",
    targetEntityId: "test-prospect-1",
    targetChannel: "email",
    recipientEmail: "alex@example.test",
    payload,
    payloadHash,
    evidenceCitations: [],
    proposedAt: Date.now(),
  };

  const result = authorizer.authorize(action, run);
  assert.equal(result.authorized, true);
  assert.equal(result.decision, "AUTHORIZED");
  assert.ok(result.auditTrailId);

  // Verify that an audit event was emitted to the store
  const events = store.events(action.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "action_authorization_evaluated");
});
