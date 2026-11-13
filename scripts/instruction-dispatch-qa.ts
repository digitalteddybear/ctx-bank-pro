import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/agents/[[...segments]]/route";
import { outreachStore } from "../src/lib/server/outreach/runtime";
import { getMessageBus } from "../src/lib/server/outreach/orchestrator/bus";

test("instruction dispatch authenticates, persists receipt and reaches the selected agent without creating a run", async () => {
  process.env.CTX_OUTREACH_DB_PATH = ":memory:";
  process.env.CTX_OUTREACH_OPERATOR_TOKEN = "qa-instruction-token-with-24-characters";
  const request = (token: string) => new NextRequest("http://localhost/api/agents", { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`}, body:JSON.stringify({action:"dispatch-instruction", agentId:"prospect", text:"Review pipeline context", documentIds:["doc-qa"]}) });
  try {
    assert.equal((await POST(request("wrong"), {params:Promise.resolve({})})).status, 401);
    const response = await POST(request(process.env.CTX_OUTREACH_OPERATOR_TOKEN), {params:Promise.resolve({})});
    assert.equal(response.status, 202);
    assert.equal(outreachStore().events("orchestrator-instructions").length, 1);
    assert.equal(outreachStore().list().length, 0);
    const message = getMessageBus().getRecentMessages(1)[0];
    assert.equal(message.recipient, "prospect");
    assert.equal(message.payload.text, "Review pipeline context");
  } finally { outreachStore().close(); }
});
