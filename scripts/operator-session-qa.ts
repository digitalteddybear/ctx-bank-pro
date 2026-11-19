import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { NextRequest } from "next/server";
import { createOperatorSession, validOperatorSession, verifyOperatorPassword, sessionCookie } from "../src/lib/server/operator-session";
import { proxy } from "../src/proxy";

test("administrator sign-in verifies password and signed session; forged sessions fail",async()=>{
  process.env.CTX_SESSION_SECRET="a".repeat(64);
  process.env.CTX_ADMIN_EMAIL="operator@example.test";
  const salt="ab".repeat(16);
  process.env.CTX_ADMIN_PASSWORD_HASH="scrypt:"+salt+":"+scryptSync("test-passphrase",salt,64).toString("hex");
  assert.equal(verifyOperatorPassword("wrong"),false);
  assert.equal(verifyOperatorPassword("test-passphrase"),true);
  const token=await createOperatorSession("operator@example.test");
  const valid=new NextRequest("https://ctx.example.test/api/agents",{headers:{cookie:sessionCookie+"="+token}});
  assert.equal(await validOperatorSession(valid),true);
  assert.equal(await validOperatorSession(new NextRequest("https://ctx.example.test/api/agents",{headers:{cookie:sessionCookie+"=forged"}})),false);
  process.env.CTX_REQUIRE_LOGIN="true";
  process.env.CTX_OUTREACH_OPERATOR_TOKEN="b".repeat(64);
  assert.equal((await proxy(new NextRequest("https://ctx.example.test/api/agents"))).status,401);
  assert.equal((await proxy(valid)).headers.get("x-middleware-request-authorization"),"Bearer "+"b".repeat(64));
});
