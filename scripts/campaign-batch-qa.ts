import test from 'node:test';
import assert from 'node:assert/strict';
import { OutreachStore } from '../src/lib/server/outreach/store';
import { OutreachEngine } from '../src/lib/server/outreach/engine';
import { FixtureModel } from '../src/lib/server/outreach/models';
import { CAMPAIGN_RAMP, OutreachScheduler, sendingWindow } from '../src/lib/server/outreach/scheduler';
import { interpolateOpeningMessage, openingMessageFieldsFromText } from '../src/lib/server/outreach/message-template';

// Campaign corpus hydration reads CRM context through the singleton store.
// Keep its incidental SQLite state in memory during offline QA.
process.env.CTX_OUTREACH_DB_PATH=':memory:';

test('ramp totals 949; UK business window handles weekend and DST',()=>{
  assert.equal(CAMPAIGN_RAMP.reduce((a,b)=>a+b,0),949);
  assert.equal(sendingWindow(Date.parse('2026-11-02T08:29:00Z')).open,false);
  assert.equal(sendingWindow(Date.parse('2026-11-02T08:30:00Z')).open,true);
  assert.equal(sendingWindow(Date.parse('2026-07-06T07:30:00Z')).open,true);
  assert.equal(sendingWindow(Date.parse('2026-11-01T10:00:00Z')).open,false);
  assert.equal(sendingWindow(Date.parse('2026-11-02T17:30:00Z')).open,false);
});
test('opening template resolves contact, sender and configured footer fields without a booking link',()=>{
  const fields=openingMessageFieldsFromText('Alex Rivera','Firm: Northwind\nRole: Director\nStated interest: managed funds\nTailored hook: their stated research',{senderName:'Dylan',senderEmail:'dylan@example.test',standardFooter:'ASP Consulting Partners Ltd · Privacy notice',contactProperties:{firstname:'Alex',lastname:'Rivera',email:'alex@example.test',company:'Northwind',jobtitle:'Director'}});
  const result=interpolateOpeningMessage('Hello {{First name}} {{Last name}} ({{Email}}) at {{Firm}}. {{Role}}; {{Macro interest}}; {{Tailored hook}}. I am {{Sender}} ({{Sender email}}). {{Standard company and privacy footer}}. {{booking_link}}',fields);
  assert.deepEqual(result.missing,[]);
  assert.equal(result.text,'Hello Alex Rivera (alex@example.test) at Northwind. Director; managed funds; their stated research. I am Dylan (dylan@example.test). ASP Consulting Partners Ltd · Privacy notice. ');
  const incomplete=interpolateOpeningMessage('Hello {{First name}} at {{Standard company and privacy footer}}.',{...fields,standard_company_and_privacy_footer:''});
  assert.deepEqual(incomplete.missing,['{{Standard company and privacy footer}}']);
});
test('claims prioritize replies, enforce pacing, and hold ambiguous crash recovery',()=>{
  const store=new OutreachStore(':memory:');
  try {
    const engine=new OutreachEngine(store,new FixtureModel());
    const run=engine.create({id:'qa',name:'Synthetic',email:'qa@example.test',permission:'granted',facts:[]});
    const scheduler=new OutreachScheduler(store);const now=Date.parse('2026-11-02T09:00:00Z');
    scheduler.enqueue({id:'initial',runId:run.id,sender:'sender@example.test',kind:'initial'},now);
    scheduler.enqueue({id:'reply',runId:run.id,sender:'sender@example.test',kind:'reply'},now);
    const claim=scheduler.claim('sender@example.test',0,now,()=>0.5)!;
    assert.equal(claim.id,'reply');
    assert.equal(scheduler.claim('sender@example.test',0,now,()=>0.5),undefined);
    scheduler.recover(now+120001);
    assert.equal(store.db.prepare('SELECT state FROM delivery_queue WHERE id=?').get('reply')?.state,'uncertain');
    assert.throws(()=>scheduler.finish(claim,'accepted',now+120002));
    store.db.prepare('UPDATE sender_days SET reserved=135').run();
    assert.equal(scheduler.claim('sender@example.test',0,now+180000),undefined);
  } finally {store.close();}
});

test('campaign preparation persists held selections and prevents duplicate enrollment and request reuse',async()=>{
  const { CampaignRegistry }=await import('../src/lib/server/outreach/campaigns');
  const store=new OutreachStore(':memory:');
  try {
    const registry=new CampaignRegistry(store);
    const input={action:'start-batch',batchSize:10,segment:'all',mode:'review-required',inference:'live',requestId:crypto.randomUUID()};
    const first=await registry.start(input);
    assert.equal(first.selected,10);assert.equal(first.status,'held');
    assert.deepEqual(await registry.start(input),first);
    await assert.rejects(()=>registry.start({...input,batchSize:25}),/reused/);
    const second=await registry.start({...input,requestId:crypto.randomUUID()});assert.equal(second.selected,10);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM campaign_enrollments').get()?.n,20);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM jobs').get()?.n,0);
    const overview=await registry.overview();assert.equal(overview.cohorts.find(c=>c.id==='all')?.enrolled,20);
  }finally{store.close();}
});

test('135-contact daily campaign limit holds all selections without dispatch jobs',async()=>{
  const {CampaignRegistry}=await import('../src/lib/server/outreach/campaigns');
  const store=new OutreachStore(':memory:');
  try{
    new OutreachScheduler(store);
    const registry=new CampaignRegistry(store);
    const batch=await registry.start({action:'start-batch',batchSize:135,segment:'all',mode:'autonomous-paced',inference:'live',requestId:crypto.randomUUID()});
    assert.equal(batch.selected,135);
    assert.equal(batch.status,'held');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM jobs').get()?.n,0);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM delivery_queue').get()?.n,0);
    assert.equal(store.events(batch.id).some(event=>event.kind==='campaign_prepared'),true);
  }finally{store.close();}
});

test('pause and resume persist without bypassing permission holds',async()=>{
  const {CampaignRegistry}=await import('../src/lib/server/outreach/campaigns');
  const store=new OutreachStore(':memory:');
  try{
    const registry=new CampaignRegistry(store);
    const batch=await registry.start({action:'start-batch',batchSize:10,segment:'all',mode:'autonomous-paced',inference:'live',requestId:crypto.randomUUID()});
    assert.equal(registry.control(batch.id,'pause-batch').status,'paused');
    assert.equal(registry.control(batch.id,'pause-batch').status,'paused');
    assert.equal(new CampaignRegistry(store).list()[0].status,'paused');
    assert.equal(registry.control(batch.id,'resume-batch').status,'held');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM jobs').get()?.n,0);
    assert.throws(()=>registry.control(crypto.randomUUID(),'resume-batch'),/not found/);
  }finally{store.close();}
});
