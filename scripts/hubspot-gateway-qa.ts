import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HubSpotZeroTrustGateway } from "../src/lib/server/integrations/hubspot-gateway";
import { HubSpotAuditLogger, maskSecrets } from "../src/lib/server/integrations/hubspot-audit";
import { APPROVED_25_LEADS, isAllowlistedContact } from "../src/lib/server/integrations/hubspot-allowlist";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/integrations/hubspot/route";

function makeTestHarness(customFetch?: typeof fetch) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "hubspot-test-"));
  const dbPath = path.join(tmpDir, "audit.sqlite");
  const auditLogger = new HubSpotAuditLogger(dbPath);
  const gateway = new HubSpotZeroTrustGateway(auditLogger, customFetch);

  return {
    gateway,
    auditLogger,
    cleanup: () => {
      try {
        auditLogger.close();
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    },
  };
}

test("allowlist: exactly 25 approved leads are present and immutable", () => {
  assert.equal(APPROVED_25_LEADS.length, 25);
  assert.throws(() => {
    // @ts-expect-error test immutability
    APPROVED_25_LEADS.push({ hubspotId: "0", email: "evil@test.com", name: "Evil" });
  });
  const first = APPROVED_25_LEADS[0];
  assert.equal(isAllowlistedContact(first.hubspotId, first.email), true);
  assert.equal(isAllowlistedContact(first.hubspotId, "wrong@domain.test"), false);
  assert.equal(isAllowlistedContact("99999999999", first.email), false);
});

test("security 1 & 8: fail-closed default (HUBSPOT_WRITES_ENABLED=false)", async () => {
  const previous = process.env.HUBSPOT_WRITES_ENABLED;
  const { gateway, auditLogger, cleanup } = makeTestHarness();
  try {
    delete process.env.HUBSPOT_WRITES_ENABLED; // default: not set = false
    const lead = APPROVED_25_LEADS[0];

    const result = await gateway.updateOutreachStatus({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: "msg-test-fail-closed-1",
      approvedBy: "operator-dylan",
      properties: {
        ctx_status: "Dispatched",
        ctx_last_contact: new Date().toISOString(),
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "dry_run");
    assert.equal(result.decision, "ALLOWED_DRY_RUN");
    assert.ok(result.detail?.includes("Live write withheld"));

    const recent = auditLogger.listRecent();
    assert.equal(recent.length, 1);
    assert.equal(recent[0].decision, "ALLOWED_DRY_RUN");
    assert.equal(recent[0].status, "dry_run");
  } finally {
    process.env.HUBSPOT_WRITES_ENABLED = previous;
    cleanup();
  }
});

test("security 3: denies write to non-allowlisted contact ID", async () => {
  const { gateway, auditLogger, cleanup } = makeTestHarness();
  try {
    const result = await gateway.updateOutreachStatus({
      hubspotId: "99999999999",
      email: "unauthorized@external.test",
      messageId: "msg-test-allowlist-denied",
      approvedBy: "operator-dylan",
      properties: { ctx_status: "Dispatched" },
    });

    assert.equal(result.success, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.decision, "DENIED_NOT_IN_ALLOWLIST");

    const recent = auditLogger.listRecent();
    assert.equal(recent.length, 1);
    assert.equal(recent[0].decision, "DENIED_NOT_IN_ALLOWLIST");
  } finally {
    cleanup();
  }
});

test("security 3: denies write when contact ID is valid but email does not match", async () => {
  const { gateway, auditLogger, cleanup } = makeTestHarness();
  try {
    const lead = APPROVED_25_LEADS[0];
    const result = await gateway.updateOutreachStatus({
      hubspotId: lead.hubspotId,
      email: "spoofed.email@attacker.test",
      messageId: "msg-test-email-mismatch",
      approvedBy: "operator-dylan",
      properties: { ctx_status: "Dispatched" },
    });

    assert.equal(result.success, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.decision, "DENIED_NOT_IN_ALLOWLIST");
  } finally {
    cleanup();
  }
});

test("security 4: denies unauthorized contact properties", async () => {
  const { gateway, auditLogger, cleanup } = makeTestHarness();
  try {
    const lead = APPROVED_25_LEADS[0];
    const result = await gateway.updateOutreachStatus({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: "msg-test-unauthorized-prop",
      approvedBy: "operator-dylan",
      properties: {
        ctx_status: "Dispatched",
        unauthorized_field: "malicious_payload",
      },
    });

    assert.equal(result.success, false);
    assert.equal(result.status, "blocked");
    assert.ok(
      result.decision === "DENIED_FIELD_UNAUTHORIZED" ||
      result.decision === "DENIED_MALFORMED_PAYLOAD"
    );
  } finally {
    cleanup();
  }
});

test("security 7: denies duplicate operations with same messageId (idempotency)", async () => {
  const { gateway, cleanup } = makeTestHarness();
  const previousWrites=process.env.HUBSPOT_WRITES_ENABLED, previousToken=process.env.HUBSPOT_ACCESS_TOKEN;
  try {
    const lead = APPROVED_25_LEADS[1];
    const msgId = "idempotency-key-001";

    delete process.env.HUBSPOT_WRITES_ENABLED;
    const first = await gateway.updateOutreachStatus({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: msgId,
      approvedBy: "operator-dylan",
      properties: { ctx_status: "Dispatched" },
    });
    assert.equal(first.success, true);

    assert.equal(first.status,"dry_run");
    // A dry run is not a completed write and must not poison later live sync.
    process.env.HUBSPOT_WRITES_ENABLED="true";
    process.env.HUBSPOT_ACCESS_TOKEN="pat-mock-token-for-testing-only-1234567890";
    const liveHarness=makeTestHarness(async()=>new Response("{}",{status:200}));
    const liveFirst=await liveHarness.gateway.updateOutreachStatus({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: msgId,
      approvedBy: "operator-dylan",
      properties: { ctx_status: "Dispatched" },
    });

    assert.equal(liveFirst.success,true);
    const second = await liveHarness.gateway.updateOutreachStatus({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: msgId,
      approvedBy: "operator-dylan",
      properties: { ctx_status: "Dispatched" },
    });
    assert.equal(second.success, false);
    assert.equal(second.status, "blocked");
    assert.equal(second.decision, "DENIED_IDEMPOTENT_DUPLICATE");
    assert.ok(second.error?.includes("Duplicate messageId"));
    liveHarness.cleanup();
  } finally {
    process.env.HUBSPOT_WRITES_ENABLED=previousWrites;
    process.env.HUBSPOT_ACCESS_TOKEN=previousToken;
    cleanup();
  }
});

test("security 9: append-only audit trail masks secrets strictly", () => {
  const dirty = "Error connecting with pat-na1-12345678-abcd-ef01-234567890123 and Bearer eyJhbGciOiJIUzI1NiJ9.test";
  const masked = maskSecrets(dirty);
  assert.equal(masked.includes("pat-na1"), false);
  assert.equal(masked.includes("eyJhbGci"), false);
  assert.ok(masked.includes("***[REDACTED]***"));
});

test("security 11: live write executes contact PATCH when HUBSPOT_WRITES_ENABLED=true using mock", async () => {
  const prevEnabled = process.env.HUBSPOT_WRITES_ENABLED;
  const prevToken = process.env.HUBSPOT_ACCESS_TOKEN;

  let capturedUrl = "";
  let capturedMethod = "";
  let capturedBody = "";
  let capturedAuth = "";

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? "GET";
    capturedBody = String(init?.body ?? "");
    capturedAuth = String((init?.headers as Record<string, string>)?.["Authorization"] ?? "");
    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  };

  const { gateway, auditLogger, cleanup } = makeTestHarness(mockFetch);

  try {
    process.env.HUBSPOT_WRITES_ENABLED = "true";
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-mock-token-for-testing-only-1234567890";

    const lead = APPROVED_25_LEADS[2];
    const result = await gateway.updateOutreachStatus({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: "msg-live-mock-1",
      approvedBy: "operator-dylan",
      properties: {
        ctx_status: "Dispatched",
        ctx_booking_link_sent: true,
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "applied");
    assert.equal(result.decision, "ALLOWED_LIVE");

    assert.equal(capturedMethod, "PATCH");
    assert.ok(capturedUrl.includes(`/crm/v3/objects/contacts/${lead.hubspotId}`));
    assert.ok(capturedAuth.includes("Bearer pat-mock-token"));
    assert.ok(capturedBody.includes('"ctx_status":"Dispatched"'));

    // Check audit trail
    const audit = auditLogger.listRecent();
    assert.equal(audit[0].decision, "ALLOWED_LIVE");
    assert.equal(audit[0].status, "applied");
    // Ensure token is NOT leaked in audit record
    assert.equal(audit[0].sanitizedPayload.includes("pat-mock-token"), false);
  } finally {
    process.env.HUBSPOT_WRITES_ENABLED = prevEnabled;
    process.env.HUBSPOT_ACCESS_TOKEN = prevToken;
    cleanup();
  }
});

test("security 11: live email engagement uses the email object and contact association", async () => {
  const prevEnabled = process.env.HUBSPOT_WRITES_ENABLED;
  const prevToken = process.env.HUBSPOT_ACCESS_TOKEN;

  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ id: "note-123" }), { status: 201 });
  };

  const { gateway, cleanup } = makeTestHarness(mockFetch);

  try {
    process.env.HUBSPOT_WRITES_ENABLED = "true";
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-mock-token-for-testing-only-1234567890";

    const lead = APPROVED_25_LEADS[3];
    const result = await gateway.logEmailEngagement({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: "msg-live-note-1",
      approvedBy: "operator-dylan",
      subject: "Private Market Opportunities Consultation",
      bodyText: "Hello, we would be delighted to connect.",
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "applied");
    assert.ok(capturedUrl.includes("/crm/v3/objects/emails"));

    const associations = (capturedBody as { associations: { to: { id: string }; types: { associationTypeId: number }[] }[] }).associations;
    assert.equal(associations[0].to.id, lead.hubspotId);
    assert.equal(associations[0].types[0].associationTypeId, 198); // Email to contact
    assert.equal((capturedBody.properties as Record<string,string>).hs_email_direction,"EMAIL");
  } finally {
    process.env.HUBSPOT_WRITES_ENABLED = prevEnabled;
    process.env.HUBSPOT_ACCESS_TOKEN = prevToken;
    cleanup();
  }
});

test("conversation trajectory: email and reply engagements preserve hs_email_thread_id for visual timeline grouping", async () => {
  const prevEnabled = process.env.HUBSPOT_WRITES_ENABLED;
  const prevToken = process.env.HUBSPOT_ACCESS_TOKEN;
  const capturedBodies: Record<string, unknown>[] = [];
  const { gateway, cleanup } = makeTestHarness(async (input, init) => {
    capturedBodies.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ id: `email-${capturedBodies.length}` }), { status: 201 });
  });

  try {
    process.env.HUBSPOT_WRITES_ENABLED = "true";
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-mock-token-for-testing-only-1234567890";

    const lead = APPROVED_25_LEADS[3];
    const threadId = "thread-workflow-run-999";

    // 1. Initial outbound email
    const outResult = await gateway.logEmailEngagement({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: "msg-thread-outbound-1",
      approvedBy: "operator-dylan",
      subject: "Private Market Opportunities Consultation",
      bodyText: "Initial outreach message.",
      threadId,
    });
    assert.equal(outResult.success, true);

    // 2. Inbound prospect reply
    const replyResult = await gateway.logReplyEngagement({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: "msg-thread-reply-2",
      sentiment: "Interested",
      replyText: "I am interested, please tell me more.",
      threadId,
    });
    assert.equal(replyResult.success, true);

    // 3. Agent follow-up response
    const followUpResult = await gateway.logEmailEngagement({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: "msg-thread-followup-3",
      approvedBy: "automated-imap-daemon",
      subject: "Re: Private Market Opportunities Consultation",
      bodyText: "Here is our introductory schedule link.",
      threadId,
    });
    assert.equal(followUpResult.success, true);

    assert.equal(capturedBodies.length, 3);
    for (const body of capturedBodies) {
      const props = body.properties as Record<string, string>;
      assert.equal(props.hs_email_thread_id, threadId);
      assert.equal(props.hs_email_status, "SENT");
    }
    assert.equal((capturedBodies[0].properties as Record<string, string>).hs_email_direction, "EMAIL");
    assert.equal((capturedBodies[1].properties as Record<string, string>).hs_email_direction, "INCOMING_EMAIL");
    assert.equal((capturedBodies[2].properties as Record<string, string>).hs_email_direction, "EMAIL");
  } finally {
    process.env.HUBSPOT_WRITES_ENABLED = prevEnabled;
    process.env.HUBSPOT_ACCESS_TOKEN = prevToken;
    cleanup();
  }
});

test("live broker briefing is a separate Contact-associated Note", async () => {
  const previousWrites = process.env.HUBSPOT_WRITES_ENABLED;
  const previousToken = process.env.HUBSPOT_ACCESS_TOKEN;
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};
  const { gateway, cleanup } = makeTestHarness(async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ id: "note-qa" }), { status: 201 });
  });
  try {
    process.env.HUBSPOT_WRITES_ENABLED = "true";
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-mock-token-for-testing-only-1234567890";
    const lead = APPROVED_25_LEADS[4];
    const result = await gateway.logBrokerBriefingNote({
      hubspotId: lead.hubspotId,
      email: lead.email,
      messageId: "reply-note-qa-001",
      stage: "Reply received",
      prospectQuote: "Please tell me more.",
      agentBrief: "Classified as a question; this is not an eligibility assessment.",
      talkingPoints: ["Answer the question.", "Use reviewed sources.", "Escalate uncertainty."],
    });
    assert.equal(result.success, true);
    assert.equal(result.status, "applied");
    assert.ok(capturedUrl.includes("/crm/v3/objects/notes"));
    const associations = capturedBody.associations as { to: { id: string }; types: { associationTypeId: number }[] }[];
    assert.equal(associations[0].to.id, lead.hubspotId);
    assert.equal(associations[0].types[0].associationTypeId, 202);
  } finally {
    process.env.HUBSPOT_WRITES_ENABLED = previousWrites;
    process.env.HUBSPOT_ACCESS_TOKEN = previousToken;
    cleanup();
  }
});

test("security 12: microservice endpoint rejects unauthorized calls and accepts authenticated requests", async () => {
  const prevSecret = process.env.HUBSPOT_GATEWAY_SHARED_SECRET;
  const prevAuditPath=process.env.CTX_HUBSPOT_AUDIT_DB_PATH;
  const tmpDir=mkdtempSync(path.join(os.tmpdir(),"hubspot-route-test-"));
  const secret = "test-shared-microservice-secret-token-32-chars-long";
  try {
    process.env.HUBSPOT_GATEWAY_SHARED_SECRET = secret;
    process.env.CTX_HUBSPOT_AUDIT_DB_PATH=path.join(tmpDir,"audit.sqlite");

    // Call without token -> 401
    const unauthReq = new NextRequest("http://localhost:3000/api/integrations/hubspot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "updateOutreachStatus" }),
    });
    const unauthRes = await POST(unauthReq);
    assert.equal(unauthRes.status, 401);

    // Call with invalid token -> 401
    const wrongReq = new NextRequest("http://localhost:3000/api/integrations/hubspot", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-secret-token-that-is-not-authorized",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "updateOutreachStatus" }),
    });
    const wrongRes = await POST(wrongReq);
    assert.equal(wrongRes.status, 401);

    // Call with valid token -> 200 (dry-run pass)
    const lead = APPROVED_25_LEADS[4];
    const validReq = new NextRequest("http://localhost:3000/api/integrations/hubspot", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation: "updateOutreachStatus",
        payload: {
          hubspotId: lead.hubspotId,
          email: lead.email,
          messageId: `msg-service-auth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          approvedBy: "operator-dylan",
          properties: { ctx_status: "Queued" },
        },
      }),
    });
    const validRes = await POST(validReq);
    assert.equal(validRes.status, 200);
    const body = await validRes.json();
    assert.equal(body.success, true);
    assert.equal(body.status, "dry_run");
  } finally {
    process.env.HUBSPOT_GATEWAY_SHARED_SECRET = prevSecret;
    process.env.CTX_HUBSPOT_AUDIT_DB_PATH=prevAuditPath;
    rmSync(tmpDir,{recursive:true,force:true});
  }
});
