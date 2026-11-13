import { test } from "node:test";
import assert from "node:assert/strict";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { HubSpotContextStore, syncPhase1, syncPilot, type ContactSnapshot } from "../src/lib/server/integrations/hubspot-context";
import { makeRegistry, classification,validateValue,HubSpotReadClient } from "../src/lib/server/integrations/hubspot-schema";
import { APPROVED_25_LEADS } from "../src/lib/server/integrations/hubspot-allowlist";
const property={name:"investment_interest",label:"Interest",type:"string",fieldType:"text",modificationMetadata:{readOnlyValue:false,readOnlyDefinition:false}};
const registry=makeRegistry({results:[property,{...property,name:"email"},{...property,name:"ctx_status",type:"enumeration",fieldType:"select",options:[{label:"Queued",value:"queued"}]}]});
const lead=APPROVED_25_LEADS[0];
function snapshot(revision="v1"):ContactSnapshot {return {hubspotId:lead.hubspotId,email:lead.email,revision,schemaVersion:registry.version,observedAt:new Date().toISOString(),remoteUpdatedAt:new Date().toISOString(),properties:{investment_interest:"Precious metals",email:lead.email},source:"HubSpot Contact API"};}
function setup(){const store=new OutreachStore(":memory:");const ctx=new HubSpotContextStore(store);ctx.saveRegistry(registry);return {store,ctx};}
test("snapshots and current chunks are atomic, versioned and idempotent",()=>{
 const {store,ctx}=setup();try {
 assert.equal(ctx.publish(snapshot(),registry,null),true);
 assert.equal(ctx.publish(snapshot(),registry,"v1"),false);
 assert.equal(store.db.prepare("SELECT count(*) n FROM crm_chunks").get()?.n,1);
 assert.equal(ctx.contact(lead.hubspotId)?.indexState,"pending");
 assert.throws(()=>ctx.publish(snapshot("v2"),registry,"wrong"),/Concurrent/);
 assert.equal(ctx.contact(lead.hubspotId)?.snapshot.revision,"v1");
 ctx.publish({...snapshot("v2"),properties:{investment_interest:"Managed funds"}},registry,"v1");
 assert.equal(store.db.prepare("SELECT count(*) n FROM crm_contact_versions").get()?.n,2);
 assert.equal(store.db.prepare("SELECT count(*) n FROM crm_chunks WHERE revision='v1'").get()?.n,0);
 }finally{store.close();}
});
test("failed reads exclude current agent context but preserve history",()=>{const {store,ctx}=setup();try{ctx.publish(snapshot(),registry,null);ctx.fail(lead.hubspotId,"Identity mismatch");assert.equal(ctx.context(lead.hubspotId),null);assert.equal(ctx.snapshots().length,0);assert.ok(ctx.contact(lead.hubspotId));}finally{store.close();}});
test("protected fields and exact enum/date validation fail closed",()=>{
 assert.equal(classification(registry.properties.find(p=>p.name==="email")!),"protected");
 const status=registry.properties.find(p=>p.name==="ctx_status")!;
 assert.throws(()=>validateValue(status,"Queued")); assert.equal(validateValue(status,"queued"),"queued");
 const date={...status,type:"date"};assert.throws(()=>validateValue(date,"2026-02-30"));assert.throws(()=>validateValue(date,"2026-01-01T12:00:00Z"));assert.equal(validateValue(date,"2026-01-01"),"2026-01-01");
 assert.throws(()=>validateValue({...date,type:"number"},"Infinity"));assert.throws(()=>validateValue({...date,type:"bool"},"yes"));
});
test("proposals reject fabricated evidence, unknown identity and protected fields",()=>{
 const {store,ctx}=setup();try{ctx.publish(snapshot(),registry,null);
 const proposal={hubspotId:lead.hubspotId,email:lead.email,property:"investment_interest",value:"Funds",baseRevision:"v1",sourceId:"missing",quote:"Funds",observedAt:new Date().toISOString()};
 assert.throws(()=>ctx.propose(proposal),/persisted investor reply/);
 assert.throws(()=>ctx.propose({...proposal,property:"email"}),/Protected/);
 assert.throws(()=>ctx.propose({...proposal,email:"unknown@example.com"}),/Unknown/);
 assert.throws(()=>ctx.propose({...proposal,baseRevision:"old"}),/Stale/);
 }finally{store.close();}
});
test("pilot sync only uses GET and rejects mismatched live identity",async()=>{
 const {store,ctx}=setup();const previous=process.env.HUBSPOT_ACCESS_TOKEN;process.env.HUBSPOT_ACCESS_TOKEN="test-only";
 let calls=0;
 const client=new HubSpotReadClient(async(input,init)=>{
 assert.equal(init?.method,"GET");calls++;
 if(String(input).includes("/properties/"))return Response.json({results:[property]});
 return Response.json({id:lead.hubspotId,archived:false,updatedAt:"2026-01-01T00:00:00Z",properties:{email:"mismatch@example.com"}});
 });
 try{const result=await syncPilot(ctx,new Map([[lead.hubspotId,lead.email]]),client);assert.equal(result.results.length,25);assert.ok(result.results.every(r=>r.status==="failed"));assert.equal(ctx.snapshots().length,0);assert.equal(calls,2);}finally{store.close();if(previous===undefined)delete process.env.HUBSPOT_ACCESS_TOKEN;else process.env.HUBSPOT_ACCESS_TOKEN=previous;}
});

test("full Phase 1 read scope does not expand the proposal allowlist",async()=>{
 const {store,ctx}=setup(); const previous=process.env.HUBSPOT_ACCESS_TOKEN; process.env.HUBSPOT_ACCESS_TOKEN="test-only";
 const id="99999999999",email="retained@example.com";
 const client=new HubSpotReadClient(async(input,init)=>{
   if(String(input).includes("/properties/")) return Response.json({results:[property]});
   assert.equal(String(input),"https://api.hubapi.com/crm/v3/objects/contacts/batch/read"); assert.equal(init?.method,"POST");
   return Response.json({status:"COMPLETE",results:[{id,archived:false,updatedAt:"2026-01-01T00:00:00Z",properties:{email,investment_interest:"Funds"}}]});
 });
 try {const result=await syncPhase1(ctx,new Map([[id,email]]),client);assert.equal(result.results[0].status,"persisted_index_pending");assert.ok(ctx.contact(id));assert.throws(()=>ctx.propose({hubspotId:id,email,property:"investment_interest",value:"Metals",baseRevision:ctx.contact(id)!.snapshot.revision,sourceId:"reply-1",quote:"Metals",observedAt:new Date().toISOString()}),/Unknown contact/);}
 finally {store.close();if(previous===undefined)delete process.env.HUBSPOT_ACCESS_TOKEN;else process.env.HUBSPOT_ACCESS_TOKEN=previous;}
});
