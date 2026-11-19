import test from 'node:test';
import assert from 'node:assert/strict';
import {OutreachStore} from '../src/lib/server/outreach/store';
import {CampaignRegistry} from '../src/lib/server/outreach/campaigns';
import {phase1SandboxProspect} from '../src/lib/server/outreach/phase1';
import {seedFixtureSources} from '../src/lib/server/outreach/sources';
import {HubSpotContextStore} from '../src/lib/server/integrations/hubspot-context';
import {materializeCampaignRuns} from '../src/lib/server/outreach/production-delivery';
process.env.CTX_OUTREACH_DB_PATH=':memory:';
process.env.CTX_WORKER_MODE='external';
process.env.CTX_LIVE_EMAIL_DISPATCH='false';
process.env.HUBSPOT_WRITES_ENABLED='false';
async function fixture(){
  const store=new OutreachStore(':memory:');
  const registry=new CampaignRegistry(store);
  const [contact]=await registry.templateContacts('all');
  const lead=await phase1SandboxProspect(contact.id);
  seedFixtureSources(store);
  for(const source of store.sourceList())store.saveSource({...source,fixture:false});
  new HubSpotContextStore(store);
  const id=lead.id.replace(/^lead-/,'');
  const snapshot={hubspotId:id,email:lead.email,revision:'test',schemaVersion:'test',observedAt:new Date().toISOString(),remoteUpdatedAt:new Date().toISOString(),properties:{email:lead.email},source:'HubSpot Contact API'};
  store.db.prepare("INSERT INTO crm_contacts(id,revision,data,index_state) VALUES(?,?,?,'ready')").run(id,'test',JSON.stringify(snapshot));
  store.db.prepare("INSERT INTO campaign_enrollments VALUES(?,?,?,'queued','')").run(lead.id,lead.email,'test-campaign');
  store.setSetting('campaign-launch:test-campaign',JSON.stringify({permissionGranted:true,permissionReference:'Isolated QA',mode:'review-required'}));
  store.setSetting('campaign-settings:test-campaign',JSON.stringify({replyHtmlTemplate:'<p>{{message}}</p>'}));
  return {store,lead};
}

test('overlapping enrollment creates exactly one run, job and enrollment event',async()=>{
  const {store,lead}=await fixture();
  try{
    await Promise.all([materializeCampaignRuns(store,async()=>lead),materializeCampaignRuns(store,async()=>lead)]);
    assert.equal(store.list().length,1);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM jobs').get()?.n,1);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM campaign_runs').get()?.n,1);
    assert.equal(store.events(store.list()[0].id).filter(event=>event.kind==='campaign_enrolled').length,1);
  }finally{store.close();}
});

test('failed enrollment rolls back run, jobs, template and CRM grant together',async()=>{
  const {store,lead}=await fixture();
  try{
    store.db.exec("CREATE TRIGGER fail_enrollment BEFORE INSERT ON campaign_runs BEGIN SELECT RAISE(ABORT,'Injected enrollment failure'); END;");
    await materializeCampaignRuns(store,async()=>lead);
    assert.equal(store.list().length,0);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM jobs').get()?.n,0);
    assert.equal(store.setting('campaign-crm-contact:'+lead.id.slice(5)),undefined);
    assert.equal(store.setting('reply-html-template:campaign-test-campaign-'+lead.id),undefined);
    assert.equal(store.db.prepare('SELECT state FROM campaign_enrollments').get()?.state,'held');
    assert.match(String(store.db.prepare('SELECT reason FROM campaign_enrollments').get()?.reason),/Injected/);
    store.db.exec('DROP TRIGGER fail_enrollment');
    store.db.exec("UPDATE campaign_enrollments SET state='queued'");
    await materializeCampaignRuns(store,async()=>lead);
    assert.equal(store.list().length,1);
  }finally{store.close();}
});

for(const change of ['paused','cancelled','suppressed'] as const){
  test(`enrollment respects ${change} while lead hydration is pending`,async()=>{
    const {store,lead}=await fixture();
    try{
      await materializeCampaignRuns(store,async()=>{
        if(change==='paused')store.setSetting('campaign-paused:test-campaign','true');
        if(change==='cancelled')store.db.exec("UPDATE campaign_enrollments SET state='cancelled'");
        if(change==='suppressed')store.db.prepare('INSERT INTO suppressed VALUES(?,?)').run(lead.email.toLowerCase(),'Opted out');
        return lead;
      });
      assert.equal(store.list().length,0);
      assert.equal(store.db.prepare('SELECT count(*) AS n FROM jobs').get()?.n,0);
      assert.equal(store.setting('campaign-crm-contact:'+lead.id.slice(5)),undefined);
      if(change==='cancelled')assert.equal(store.db.prepare('SELECT state FROM campaign_enrollments').get()?.state,'cancelled');
    }finally{store.close();}
  });
}

test('CRM opt-out reduces available cohort and survives a failed CRM refresh',async()=>{
  const {store,lead}=await fixture();
  try{
    store.db.exec("DELETE FROM campaign_enrollments");
    const registry=new CampaignRegistry(store);
    const before=(await registry.overview()).cohorts.find(c=>c.id==="all")!;
    store.db.prepare("UPDATE crm_contacts SET data=json_set(data,'$.properties.hs_email_optout','true'),error='refresh failed'").run();
    const after=(await registry.overview()).cohorts.find(c=>c.id==="all")!;
    assert.equal(after.available,before.available-1);
    assert.equal(after.suppressed,before.suppressed+1);
    const batch=await registry.start({action:"start-batch",batchSize:10,segment:"all",mode:"review-required",inference:"live",requestId:crypto.randomUUID()});
    assert.equal(batch.selected,10);
    assert.equal(store.db.prepare("SELECT lead_id FROM campaign_enrollments WHERE lead_id=?").get(lead.id),undefined);
  }finally{store.close();}
});
