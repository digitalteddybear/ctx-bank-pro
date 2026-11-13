import { HubSpotContextStore } from "../src/lib/server/integrations/hubspot-context";
import test from "node:test";
import assert from "node:assert/strict";
import { OutreachStore, hash } from "../src/lib/server/outreach/store";
import { seedFixtureSources, fingerprint, usableSources } from "../src/lib/server/outreach/sources";
import { processProductionDelivery, validateCampaignContact } from "../src/lib/server/outreach/production-delivery";
import type { Run } from "../src/lib/server/outreach/types";
import type { SendEmailOptions } from "../src/lib/server/outreach/transport/email";

function make(count=1){
  const store=new OutreachStore(":memory:");
  seedFixtureSources(store);
  new HubSpotContextStore(store);
  for(const source of store.sourceList())store.saveSource({...source,fixture:false});
  for(let i=0;i<count;i++){
    const id="production-test-"+i,body="Hello prospect "+i;
    const run:Run={id,campaign:"relationship-reactivation",campaignId:"qa",prospect:{id:"lead-"+i,name:"Prospect "+i,email:"prospect"+i+"@example.test",permission:"granted",facts:[],dossier:"Synthetic QA only",jurisdiction:"UK",subscriberType:"individual",lawfulBasis:"consent",pecrCondition:"consent",phase1LeadId:"lead-"+i,phase1Validated:true},sandbox:false,synthetic:false,mode:"automatic",inference:"live",revision:0,status:"waiting_reply",next:"dispatch",intent:"initial",corrections:0,draftCounter:1,followups:0,createdAt:Date.now(),transcript:[{direction:"outbound",text:body,eventId:id+":1",subject:"QA",deliveryStatus:"queued"}],draft:{version:1,subject:"QA",body,hash:hash(body)},review:{decision:"pass",summary:"QA",citations:[],draftHash:hash(body),sourceFingerprint:fingerprint(usableSources(store,"live")),reviewedAt:Date.now()}};
    const snapshot={hubspotId:String(i),email:run.prospect.email,revision:"qa",schemaVersion:"qa",observedAt:new Date().toISOString(),remoteUpdatedAt:new Date().toISOString(),properties:{email:run.prospect.email},source:"HubSpot Contact API"};
    store.db.prepare("INSERT INTO crm_contacts(id,revision,data,index_state) VALUES(?,?,?,'ready')").run(String(i),"qa",JSON.stringify(snapshot));
    store.save(run);store.setSetting("reply-html-template:"+id,"<p>{{message}}</p>");
  }
  return store;
}
async function clocked(action:(advance:()=>void)=>Promise<void>){
  const originalNow=Date.now,live=process.env.CTX_LIVE_EMAIL_DISPATCH,sender=process.env.GMAIL_USER;
  let now=Date.parse("2026-11-02T08:30:00Z");
  Date.now=()=>now;
  process.env.CTX_LIVE_EMAIL_DISPATCH="true";process.env.GMAIL_USER="sender@example.test";
  try{await action(()=>{now+=200000;});}
  finally{Date.now=originalNow;if(live===undefined)delete process.env.CTX_LIVE_EMAIL_DISPATCH;else process.env.CTX_LIVE_EMAIL_DISPATCH=live;if(sender===undefined)delete process.env.GMAIL_USER;else process.env.GMAIL_USER=sender;}
}
test("135-contact queue preserves unique identities, stable IDs and accepted receipts",async()=>{
  await clocked(async advance=>{
    const store=make(135),sent:SendEmailOptions[]=[];
    try{
      for(let i=0;i<135;i++){await processProductionDelivery(store,async options=>{sent.push(options);return {sent:true,messageId:options.messageId};});advance();}
      assert.equal(sent.length,135);
      assert.equal(new Set(sent.map(message=>message.messageId)).size,135);
      assert.equal(new Set(sent.map(message=>message.to)).size,135);
      assert.ok(sent.every(message=>message.intent==="initial"));
      assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM delivery_queue WHERE state='accepted'").get()?.count,135);
      assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM crm_delivery_jobs").get()?.count,270);
      assert.ok(store.list().every(run=>run.transcript[0].deliveryStatus==="sent"));
      await processProductionDelivery(store,async()=>{throw new Error("Accepted work must never resend.");});
    }finally{store.db.close();}
  });
});
test("uncertain SMTP outcomes do not automatically resend",async()=>{
  await clocked(async advance=>{
    const store=make();let sends=0;
    try{
      await processProductionDelivery(store,async()=>{sends++;return {sent:false,error:"Connection ended after DATA."};});
      advance();
      await processProductionDelivery(store,async()=>{sends++;return {sent:true};});
      assert.equal(sends,1);
      assert.equal(store.db.prepare("SELECT state FROM delivery_queue").get()?.state,"uncertain");
    }finally{store.db.close();}
  });
});
test("superseded approval and paused campaigns cannot send",async()=>{
  await clocked(async()=>{
    const store=make();let sends=0;
    try{
      store.setSetting("campaign-paused:qa","true");
      await processProductionDelivery(store,async()=>{sends++;return {sent:true};});
      assert.equal(sends,0);
      store.setSetting("campaign-paused:qa","false");
      const run=store.get("production-test-0");run.review!.draftHash="superseded";store.save(run);
      await processProductionDelivery(store,async()=>{sends++;return {sent:true};});
      assert.equal(sends,0);
      assert.equal(store.db.prepare("SELECT state FROM delivery_queue").get()?.state,"cancelled");
    }finally{store.db.close();}
  });
});

test("production enrollment only accepts indexed existing HubSpot identities",()=>{
  const store=make();
  try{
    assert.equal(validateCampaignContact(store,"lead-0","prospect0@example.test").snapshot.hubspotId,"0");
    assert.throws(()=>validateCampaignContact(store,"lead-999","unknown@example.test"),/matching existing/);
    assert.throws(()=>validateCampaignContact(store,"lead-0","different@example.test"),/matching existing/);
    assert.throws(()=>validateCampaignContact(store,"lead-new","prospect0@example.test"),/numeric/);
    store.db.prepare("UPDATE crm_contacts SET index_state='pending' WHERE id='0'").run();
    assert.throws(()=>validateCampaignContact(store,"lead-0","prospect0@example.test"),/index/);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM crm_contacts").get()?.n,1);
  }finally{store.db.close();}
});

test("nested receipts commit atomically and roll back on failure",()=>{
  const store=new OutreachStore(":memory:");
  try{
    assert.throws(()=>store.transaction(()=>{
      store.setSetting("outer","pending");
      store.transaction(()=>store.setSetting("inner","pending"));
      throw new Error("Crash before commit");
    }),/Crash/);
    assert.equal(store.setting("outer"),undefined);
    assert.equal(store.setting("inner"),undefined);
    store.transaction(()=>store.transaction(()=>store.setSetting("committed","yes")));
    assert.equal(store.setting("committed"),"yes");
  }finally{store.close();}
});
