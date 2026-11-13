import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { FixtureModel } from "../src/lib/server/outreach/models";
import { APPROVED_25_LEADS } from "../src/lib/server/integrations/hubspot-allowlist";
import { NextRequest } from "next/server";

test("Cal booking webhook requires HMAC and reconciles one opaque reference idempotently", async () => {
  const folder=mkdtempSync(path.join(os.tmpdir(),"ctx-cal-qa-"));
  const previous={db:process.env.CTX_OUTREACH_DB_PATH,hubspot:process.env.CTX_HUBSPOT_AUDIT_DB_PATH,secret:process.env.CAL_WEBHOOK_SECRET,writes:process.env.HUBSPOT_WRITES_ENABLED};
  process.env.CTX_OUTREACH_DB_PATH=path.join(folder,"workflows.sqlite");
  process.env.CTX_HUBSPOT_AUDIT_DB_PATH=path.join(folder,"hubspot.sqlite");
  process.env.CAL_WEBHOOK_SECRET="qa-cal-secret-32-characters-minimum";
  process.env.HUBSPOT_WRITES_ENABLED="false";
  try {
    const store=new OutreachStore(process.env.CTX_OUTREACH_DB_PATH);
    const contact=APPROVED_25_LEADS[0];
    const engine=new OutreachEngine(store,new FixtureModel());
    const run=engine.create({id:"qa-booking",name:contact.name,email:"qa@example.test",permission:"granted",facts:[]});
    run.prospect.id=`lead-${contact.hubspotId}`;
    run.prospect.email=contact.email;
    run.status="booking_pending";
    store.save(run);
    const reference=randomBytes(32).toString("base64url");
    store.db.exec("CREATE TABLE IF NOT EXISTS booking_references(ref_hash TEXT PRIMARY KEY,run_id TEXT NOT NULL,created_at INTEGER NOT NULL,consumed_at INTEGER)");
    store.db.prepare("INSERT INTO booking_references(ref_hash,run_id,created_at) VALUES(?,?,?)").run(createHash("sha256").update(reference).digest("hex"),run.id,Date.now());
    store.close();

    const {POST}=await import("../src/app/api/webhooks/cal/route");
    const body=JSON.stringify({triggerEvent:"BOOKING_CREATED",payload:{bookingId:3301,uid:"qa-cal-uid",startTime:"2026-12-01T10:00:00.000Z",status:"ACCEPTED",requiresConfirmation:false,attendees:[{email:contact.email}],metadata:{user_id:reference}}});
    const invalid=await POST(new Request("http://localhost/api/webhooks/cal",{method:"POST",headers:{"x-cal-signature-256":"0".repeat(64)},body}));
    assert.equal(invalid.status,401);
    const mismatchedBody=JSON.stringify({triggerEvent:"BOOKING_CREATED",payload:{bookingId:3301,uid:"qa-cal-mismatch",startTime:"2026-12-01T10:00:00.000Z",status:"ACCEPTED",requiresConfirmation:false,attendees:[{email:"other@example.test"}],metadata:{user_id:reference}}});
    const mismatchedSignature=createHmac("sha256",process.env.CAL_WEBHOOK_SECRET).update(mismatchedBody).digest("hex");
    const mismatched=await POST(new Request("http://localhost/api/webhooks/cal",{method:"POST",headers:{"x-cal-signature-256":mismatchedSignature},body:mismatchedBody}));
    assert.equal(mismatched.status,409);
    const signature=createHmac("sha256",process.env.CAL_WEBHOOK_SECRET).update(body).digest("hex");
    const first=await POST(new Request("http://localhost/api/webhooks/cal",{method:"POST",headers:{"x-cal-signature-256":signature},body}));
    assert.equal(first.status,200);
    assert.equal((await first.json()).ok,true);
    const duplicate=await POST(new Request("http://localhost/api/webhooks/cal",{method:"POST",headers:{"x-cal-signature-256":signature},body}));
    assert.equal(duplicate.status,200);
    assert.equal((await duplicate.json()).duplicate,true);
    const finalStore=new OutreachStore(process.env.CTX_OUTREACH_DB_PATH);
    try {
      assert.equal(finalStore.get(run.id).status,"booked");
      assert.equal(finalStore.events(run.id).filter(event=>event.kind==="cal_booking_reconciled").length,1);
    }
    finally { finalStore.close(); }

    const {GET}=await import("../src/app/api/agents/[[...segments]]/route");
    const telemetry=await GET(new NextRequest("http://localhost/api/agents/telemetry?window=1d&environment=staging&region=all",{headers:{origin:"http://localhost","sec-fetch-site":"same-origin"}}),{params:Promise.resolve({segments:["telemetry"]})});
    assert.equal(telemetry.status,200);
    const payload=await telemetry.json() as {bookingAudit:{bookingId:string;contactId:string}[]};
    assert.equal(payload.bookingAudit.length,1);
    assert.equal(payload.bookingAudit[0].bookingId,"3301");
    assert.equal(payload.bookingAudit[0].contactId,contact.hubspotId);
  } finally {
    process.env.CTX_OUTREACH_DB_PATH=previous.db;
    process.env.CTX_HUBSPOT_AUDIT_DB_PATH=previous.hubspot;
    process.env.CAL_WEBHOOK_SECRET=previous.secret;
    process.env.HUBSPOT_WRITES_ENABLED=previous.writes;
    rmSync(folder,{recursive:true,force:true});
  }
});
