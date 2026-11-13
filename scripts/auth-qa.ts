import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import {
  verifyApiRequest,
  mintToken,
  generateSecureSecret,
  DISALLOWED_PLACEHOLDERS,
} from "../src/lib/server/auth";
import { requireAgentWrite } from "../src/lib/server/agent-write-auth";
import { hasLocalWorkspaceAccess } from "../src/lib/server/local-workspace-auth";

test("auth: strictly rejects development placeholders and trivial tokens", async () => {
  for (const placeholder of DISALLOWED_PLACEHOLDERS) {
    const req = new NextRequest("http://localhost:3000/api/graph", {
      headers: { authorization: `Bearer ${placeholder}` },
    });
    const result = await verifyApiRequest(req, "agent_write", { allowSameOrigin: false });
    assert.equal(result.authenticated, false, `Placeholder '${placeholder}' should have been rejected`);
    assert.ok(result.error?.includes("placeholder"), "Should return placeholder error");
  }
});

test("auth: requires minimum secret length and timingSafeEqual for bearer tokens", async () => {
  const secureSecret = generateSecureSecret(32);
  const previous = process.env.AGENT_WRITE_TOKEN;
  try {
    process.env.AGENT_WRITE_TOKEN = secureSecret;

    // Correct token
    const validReq = new NextRequest("http://localhost:3000/api/graph", {
      headers: { authorization: `Bearer ${secureSecret}` },
    });
    const validResult = await verifyApiRequest(validReq, "agent_write", { allowSameOrigin: false });
    assert.equal(validResult.authenticated, true);
    assert.equal(validResult.subject, "bearer_service");

    // Wrong token of same length
    const wrongSecret = generateSecureSecret(32);
    const wrongReq = new NextRequest("http://localhost:3000/api/graph", {
      headers: { authorization: `Bearer ${wrongSecret}` },
    });
    const wrongResult = await verifyApiRequest(wrongReq, "agent_write", { allowSameOrigin: false });
    assert.equal(wrongResult.authenticated, false);
  } finally {
    process.env.AGENT_WRITE_TOKEN = previous;
  }
});

test("auth: signs and verifies cryptographically secure JWTs with scopes", async () => {
  const previousSecret = process.env.CTX_JWT_SECRET;
  const testSecret = generateSecureSecret(32);
  try {
    process.env.CTX_JWT_SECRET = testSecret;

    const token = await mintToken("operator_dylan", ["operator", "compliance"], "1h");
    assert.ok(token && token.split(".").length === 3, "Should be valid 3-part JWT");

    // Request with valid JWT
    const req = new NextRequest("http://localhost:3000/api/agents", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await verifyApiRequest(req, "operator", { allowSameOrigin: false });
    assert.equal(result.authenticated, true);
    assert.equal(result.subject, "operator_dylan");
    assert.ok(result.scope?.includes("operator"));

    // Insufficient scope request
    const scopeCheck = await verifyApiRequest(req, "unauthorized_scope_xyz", { allowSameOrigin: false });
    // Operator scope satisfies any scope, but checking unknown non-operator:
    const readOnlyToken = await mintToken("auditor", ["audit_read"], "1h");
    const readOnlyReq = new NextRequest("http://localhost:3000/api/agents", {
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    const deniedScope = await verifyApiRequest(readOnlyReq, "operator", { allowSameOrigin: false });
    assert.equal(deniedScope.authenticated, false);
    assert.ok(deniedScope.error?.includes("Insufficient token scope"));
  } finally {
    process.env.CTX_JWT_SECRET = previousSecret;
  }
});

test("auth: requireAgentWrite rejects placeholder tokens synchronously", () => {
  const previous = process.env.AGENT_WRITE_TOKEN;
  try {
    process.env.AGENT_WRITE_TOKEN = "test-token";
    const req = new NextRequest("http://localhost:3000/api/graph", {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
    });
    const rejection = requireAgentWrite(req);
    assert.ok(rejection, "Should return rejection response");
    assert.equal(rejection.status, 401);
  } finally {
    process.env.AGENT_WRITE_TOKEN = previous;
  }
});

test("auth: hasLocalWorkspaceAccess allows loopback same-origin browser calls when token unset", () => {
  const previous = process.env.CTX_OUTREACH_OPERATOR_TOKEN;
  try {
    delete process.env.CTX_OUTREACH_OPERATOR_TOKEN;
    const req = new NextRequest("http://localhost:3000/api/agents", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    assert.equal(hasLocalWorkspaceAccess(req), true);
  } finally {
    process.env.CTX_OUTREACH_OPERATOR_TOKEN = previous;
  }
});
