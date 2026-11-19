import test from 'node:test';
import assert from 'node:assert/strict';
import {OutreachStore} from '../src/lib/server/outreach/store';
import {processCrmJobs,queueCrmJob,resolveCrmJob} from '../src/lib/server/outreach/production-delivery';
import type {GatewayOperationResult} from '../src/lib/server/integrations/hubspot-types';
const applied:GatewayOperationResult={success:true,operation:'updateOutreachStatus',hubspotId:'123',status:'applied',decision:'ALLOWED_LIVE'};
function gateway(action:()=>Promise<GatewayOperationResult>){return {updateOutreachStatus:action,logEmailEngagement:action,logReplyEngagement:action,logBrokerBriefingNote:action};}
async function setup(action:(store:OutreachStore)=>Promise<void>){
  const previous=process.env.HUBSPOT_WRITES_ENABLED;
  process.env.HUBSPOT_WRITES_ENABLED='true';
  const store=new OutreachStore(':memory:');
  try{await action(store);}finally{store.close();if(previous===undefined)delete process.env.HUBSPOT_WRITES_ENABLED;else process.env.HUBSPOT_WRITES_ENABLED=previous;}
}
test('expired CRM worker cannot overwrite the newer claim result',async()=>setup(async store=>{
  queueCrmJob(store,'status','run','status',{});
  let rejectOld:(error:Error)=>void=()=>{throw new Error('Missing pending request');};
  const pending=new Promise<GatewayOperationResult>((_,reject)=>{rejectOld=reject;});
  const old=processCrmJobs(store,()=>gateway(()=>pending));
  store.db.exec("UPDATE crm_delivery_jobs SET lease=0");
  await processCrmJobs(store,()=>gateway(async()=>applied));
  rejectOld(new Error('Late failure from expired worker'));
  await old;
  assert.equal(store.db.prepare('SELECT state FROM crm_delivery_jobs').get()?.state,'applied');
  assert.equal(store.events('run').length,0);
}));
test('ambiguous email creation requires reconciliation and does not replay',async()=>setup(async store=>{
  queueCrmJob(store,'email','run','outbound',{});let calls=0;
  const factory=()=>gateway(async()=>{calls++;throw new Error('Disconnected after remote acceptance');});
  await processCrmJobs(store,factory);await processCrmJobs(store,factory);
  assert.equal(calls,1);
  assert.equal(store.db.prepare('SELECT state FROM crm_delivery_jobs').get()?.state,'uncertain');
  assert.equal(store.events('run')[0].kind,'crm_reconciliation_required');
  resolveCrmJob(store,'email','applied');
  await processCrmJobs(store,factory);assert.equal(calls,1);
}));
test('operator retry replaces claim token so old success cannot finish new work',async()=>setup(async store=>{
  queueCrmJob(store,'email','run','outbound',{});
  let complete:((value:GatewayOperationResult)=>void)|undefined;
  const pending=new Promise<GatewayOperationResult>(resolve=>{complete=resolve;});
  const old=processCrmJobs(store,()=>gateway(()=>pending));
  store.db.exec('UPDATE crm_delivery_jobs SET lease=0');
  await processCrmJobs(store,()=>gateway(async()=>applied));
  resolveCrmJob(store,'email','retry');
  complete!(applied); await old;
  assert.equal(store.db.prepare('SELECT state FROM crm_delivery_jobs').get()?.state,'queued');
  await processCrmJobs(store,()=>gateway(async()=>applied));
  assert.equal(store.db.prepare('SELECT state FROM crm_delivery_jobs').get()?.state,'applied');
}));

test('explicit CRM rejection can retry without being marked ambiguous',async()=>setup(async store=>{
  queueCrmJob(store,'email','run','outbound',{});
  await processCrmJobs(store,()=>gateway(async()=>({...applied,success:false,status:'blocked',decision:'DENIED_KILL_SWITCH'})));
  assert.equal(store.db.prepare('SELECT state FROM crm_delivery_jobs').get()?.state,'queued');
}));
