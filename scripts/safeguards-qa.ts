import assert from "node:assert/strict";
import { test } from "node:test";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { FixtureModel } from "../src/lib/server/outreach/models";
import { seedFixtureSources } from "../src/lib/server/outreach/sources";
import {
  detectHumanTakeover,
  isAgentInstigatedThread,
  validatePhase1Contact,
  TAG_PHASE1_VALIDATED,
  TAG_HUMAN_MANAGED,
  TAG_AGENT_YIELDED,
  VALUE_ASP_AUTONOMOUS_AGENT,
} from "../src/lib/server/outreach/safeguards";

function make() {
  const store = new OutreachStore(":memory:");
  seedFixtureSources(store);
  const engine = new OutreachEngine(store, new FixtureModel());
  return { store, engine };
}

test("Phase 1 perimeter blocks contacts not parsed or validated through Phase 1", () => {
  const unvalidated = {
    email: "random.unparsed@domain.com",
    id: "random-contact-999",
  };
  const check = validatePhase1Contact(unvalidated);
  assert.equal(check.valid, false);
  assert.ok(check.reason?.includes("PHASE1_UNVALIDATED_RECIPIENT_BLOCKED"));

  const validated = {
    email: "alexandros@example.com",
    id: "lead-52991787848",
    phase1Validated: true,
  };
  assert.equal(validatePhase1Contact(validated).valid, true);

  const tagged = {
    email: "tagged.lead@example.com",
    tags: [TAG_PHASE1_VALIDATED],
  };
  assert.equal(validatePhase1Contact(tagged).valid, true);
});

test("createSandbox strictly rejects contacts without Phase 1 provenance", () => {
  const { engine } = make();
  assert.throws(() => {
    engine.createSandbox({
      id: "unverified-prospect",
      name: "Unknown Contact",
      email: "unknown@other-company.com",
      permission: "granted",
      facts: [{ text: "No phase 1 history", source: "external" }],
      dossier: "Unvalidated external contact",
    });
  }, /PHASE1_UNVALIDATED_RECIPIENT_BLOCKED/);
});

test("Human operator takeover detection freezes agent dispatch", () => {
  const phrases = [
    "Thanks for your call earlier today",
    "As discussed on the phone with Ziggy",
    "Spoke to Ziggy, we agreed to touch base next week",
    "Please have a human operator call me directly",
  ];

  for (const text of phrases) {
    const takeover = detectHumanTakeover(text);
    assert.equal(takeover.takeoverDetected, true);
    assert.ok(takeover.reason?.includes("HUMAN_OPERATOR_TAKEOVER"));
  }

  const normalReply = "Yes, I am interested in hearing more about your precious metals perspective.";
  assert.equal(detectHumanTakeover(normalReply).takeoverDetected, false);
});

test("Agent yields immediately when human takeover is detected in conversation", async () => {
  const { engine, store } = make();
  const run = engine.createSandbox({
    id: "lead-test-takeover",
    name: "Alex Investor",
    email: "alex@example.test",
    permission: "granted",
    phase1LeadId: "lead-test-takeover",
    phase1Validated: true,
    facts: [{ text: "Interested in private capital", source: "phase1" }],
    dossier: "Phase 1 validated dossier for Alex",
  }, "automatic");

  // Drain initial outbound
  for (let i = 0; i < 20 && (await engine.tick()); i++);
  assert.equal(store.get(run.id).status, "waiting_reply");

  // Prospect sends reply referencing telephone call with human operator
  engine.reply(run.id, "reply-1", "Thanks for your call earlier today, speak next week.");
  for (let i = 0; i < 10 && (await engine.tick()); i++);

  const updated = store.get(run.id);
  assert.equal(updated.status, "escalated");
  assert.equal(updated.escalationQueue, "human_operator");
  assert.equal(updated.humanManaged, true);
  assert.ok(updated.tags?.includes(TAG_HUMAN_MANAGED));
  assert.ok(updated.tags?.includes(TAG_AGENT_YIELDED));
});

test("Non-interference protocol blocks agent from engaging uninstigated threads", () => {
  const emptyTranscript: { direction: string; origin?: string }[] = [];
  const check = isAgentInstigatedThread(emptyTranscript);
  assert.equal(check.instigatedByAgent, false);
  assert.ok(check.reason?.includes("NON_INTERFERENCE_VIOLATION"));

  const instigatedTranscript = [
    { direction: "outbound", origin: VALUE_ASP_AUTONOMOUS_AGENT },
  ];
  assert.equal(isAgentInstigatedThread(instigatedTranscript).instigatedByAgent, true);
});

test("clearSandboxRuns removes all sandbox records while leaving fixture data", () => {
  const { engine, store } = make();
  engine.createSandbox({
    id: "lead-sandbox-1",
    name: "Sandbox One",
    email: "one@example.test",
    permission: "granted",
    phase1Validated: true,
    facts: [{ text: "Fact 1", source: "phase1" }],
    dossier: "Dossier 1",
  });
  engine.createSandbox({
    id: "lead-sandbox-2",
    name: "Sandbox Two",
    email: "two@example.test",
    permission: "granted",
    phase1Validated: true,
    facts: [{ text: "Fact 2", source: "phase1" }],
    dossier: "Dossier 2",
  });

  assert.equal(store.list().filter(r => r.sandbox).length, 2);
  const cleared = store.clearSandboxRuns();
  assert.equal(cleared, 2);
  assert.equal(store.list().filter(r => r.sandbox).length, 0);
});

test("updateEnvLocal accurately updates sender credentials in env file and process.env", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const { updateEnvLocal } = await import("./live-demo");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asp-env-test-"));
  const tmpEnvFile = path.join(tmpDir, ".env.local");
  fs.writeFileSync(
    tmpEnvFile,
    '# Existing config\nGMAIL_USER="old@example.com"\nGMAIL_APP_PASSWORD="oldpassword123"\nCTX_LIVE_EMAIL_DISPATCH=true\n',
    "utf-8"
  );

  updateEnvLocal(
    {
      GMAIL_USER: "newoperator@example.com",
      GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
    },
    tmpEnvFile
  );

  const updated = fs.readFileSync(tmpEnvFile, "utf-8");
  assert.ok(updated.includes('GMAIL_USER="newoperator@example.com"'));
  assert.ok(updated.includes('GMAIL_APP_PASSWORD="abcd efgh ijkl mnop"'));
  assert.ok(updated.includes("CTX_LIVE_EMAIL_DISPATCH=true"));
  assert.equal(process.env.GMAIL_USER, "newoperator@example.com");
  assert.equal(process.env.GMAIL_APP_PASSWORD, "abcd efgh ijkl mnop");

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("clearAllRuns completely resets conversation threads to 0 (sandbox or not)", () => {
  const { engine, store } = make();
  // Create sandbox run
  engine.createSandbox({
    id: "lead-sandbox-1",
    name: "Sandbox One",
    email: "one@example.test",
    permission: "granted",
    phase1Validated: true,
    facts: [{ text: "Fact 1", source: "phase1" }],
    dossier: "Dossier 1",
  });
  // Create synthetic/fixture non-sandbox run
  engine.create(
    {
      id: "synthetic-lead-1",
      name: "Non Sandbox Alex",
      email: "alex.non.sandbox@example.test",
      permission: "granted",
      facts: [{ text: "Synthetic test lead", source: "fixture" }],
    },
    "human"
  );

  assert.equal(store.list().length, 2);
  const cleared = store.clearAllRuns();
  assert.equal(cleared, 2);
  assert.equal(store.list().length, 0);
});

test("Title-cased headers normalized by Gmail are recognized as agent outreach without triggering false takeover", () => {
  const gmailNormalizedSource = [
    "Return-Path: <ziggyjordan2002@gmail.com>",
    "X-Asp-Origin: autonomous_agent",
    "X-Asp-Agent: Dylan (ASP Private Capital)",
    "X-Asp-Workflow-Id: run-12345",
    "Subject: Re: Your private-market interests",
  ].join("\r\n");

  const rawLower = gmailNormalizedSource.toLowerCase();
  const isAgentOutreach =
    rawLower.includes("x-asp-origin: autonomous_agent") ||
    rawLower.includes("x-asp-agent: dylan") ||
    rawLower.includes("x-asp-workflow-id") ||
    rawLower.includes("x-asp-origin");

  assert.equal(isAgentOutreach, true, "Title-cased X-Asp-Origin headers must be recognized as agent outreach");

  const manualHumanSource = [
    "Return-Path: <ziggyjordan2002@gmail.com>",
    "Subject: Checking in directly",
    "From: Ziggy <ziggyjordan2002@gmail.com>",
  ].join("\r\n");

  const manualLower = manualHumanSource.toLowerCase();
  const isManualAgentOutreach =
    manualLower.includes("x-asp-origin: autonomous_agent") ||
    manualLower.includes("x-asp-agent: dylan") ||
    manualLower.includes("x-asp-workflow-id") ||
    manualLower.includes("x-asp-origin");

  assert.equal(isManualAgentOutreach, false, "Manual operator email must not be misclassified as agent outreach");
});

test("cleanReplyBody strips email quote blocks and preserves the core prospect reply", async () => {
  const rawReply = `Yes, I am interested in hearing more about your precious metals allocations.

On Fri, Oct 30, 2026 at 11:55 AM Dylan (ASP Private Capital) <dylan@aspinvest.co.uk> wrote:
> Hello Marcus,
> We are following up regarding your recorded private-market profile...`;

  const { cleanReplyBody } = await import("../src/lib/server/outreach/transport/imap");
  const cleaned = cleanReplyBody(rawReply);
  assert.equal(cleaned, "Yes, I am interested in hearing more about your precious metals allocations.");
  assert.ok(!cleaned.includes("On Fri, Oct 30"));
  assert.ok(!cleaned.includes("Hello Marcus"));
});



