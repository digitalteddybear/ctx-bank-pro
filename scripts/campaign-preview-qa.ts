import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NextRequest} from 'next/server';
import {POST,GET} from '../src/app/api/agents/campaign/route';
import {outreachStore} from '../src/lib/server/outreach/store-instance';
import {OutreachStore} from '../src/lib/server/outreach/store';
import {CampaignRegistry} from '../src/lib/server/outreach/campaigns';
import {readDemoPreferences} from '../src/lib/server/outreach/demo-preferences';
import {readReplyTemplate} from '../src/lib/server/outreach/reply-template-store';

test('preview and save routes preserve branding, validate content and persist isolated scopes',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'ctx-preview-'));
  process.env.CTX_OUTREACH_DB_PATH=join(directory,'workflows.sqlite');
  process.env.CTX_WORKER_MODE='external';
  process.env.CTX_OUTREACH_OPERATOR_TOKEN='a'.repeat(64);
  delete process.env.CTX_OUTREACH_OPERATOR_TOKEN_FILE;
  const headers={authorization:'Bearer '+process.env.CTX_OUTREACH_OPERATOR_TOKEN,origin:'http://localhost','content-type':'application/json'};
  const post=(body:unknown)=>POST(new NextRequest('http://localhost/api/agents/campaign',{method:'POST',headers,body:JSON.stringify(body)}));
  try{
    const incomplete=await post({action:'preview-reply-template',template:'<h1>Brand design</h1>'});
    assert.equal(incomplete.status,200);
    const preview=await incomplete.json();assert.match(preview.html,/Brand design/);assert.match(preview.warning,/message/);
    const rejected=await post({action:'save-reply-template',scope:'demo',template:'<h1>Brand design</h1>'});assert.equal(rejected.status,400);
    const template='<h1>Brand design</h1><p>{{message}}</p><script>alert(1)</script>';
    const rendered=await (await post({action:'preview-reply-template',template})).json();assert.match(rendered.html,/introductory conversation/);assert.doesNotMatch(rendered.html,/script|alert\(1\)|\{\{message\}\}/);
    const saved=await post({action:'save-reply-template',scope:'demo',template});assert.equal(saved.status,200);assert.equal((await saved.json()).saved,true);
    const persisted=await GET(new NextRequest('http://localhost/api/agents/campaign?templateScope=demo',{headers}));assert.equal((await persisted.json()).template,template);
    const campaign=await post({action:'save-preferences',preferences:{openingMessage:'Hello {{First name}}',standardFooter:'ASP',replyHtmlTemplate:'<p>{{message}}</p>',replyObjectives:['answer-questions'],replyRules:[]}});assert.equal(campaign.status,200);
    const selection={segment:'dual-channel',batchSize:50,mode:'autonomous-paced'};
    const campaignSettings={openingMessage:'Campaign draft',standardFooter:'ASP',replyHtmlTemplate:'<p>{{message}}</p>',replyObjectives:['answer-questions'],replyRules:[]};
    assert.equal((await post({action:'save-preferences',preferences:{...campaignSettings,selection}})).status,200);
    // Old clients must not reset saved cohort selection.
    assert.equal((await post({action:'save-preferences',preferences:campaignSettings})).status,200);
    const draft={prospectName:'Test recipient',prospectEmail:'test@example.org',hubspotContactId:'123',customSubject:'Saved subject',customBody:'Saved body',replyHtmlTemplate:template,liveSend:false,liveCrm:false,useLiveModel:null};
    assert.equal((await post({action:'save-demo-preferences',preferences:draft})).status,200);
    const demoRead=await GET(new NextRequest('http://localhost/api/agents/campaign?preferencesScope=demo',{headers}));
    assert.deepEqual((await demoRead.json()).preferences,draft);
    const invalid=await post({action:'save-demo-preferences',preferences:{...draft,customSubject:'Must not persist',replyHtmlTemplate:'<p>Missing placeholder</p>'}});
    assert.equal(invalid.status,400);
    assert.deepEqual(readDemoPreferences(outreachStore()).preferences,draft);
    assert.equal((await post({action:'save-demo-preferences',preferences:{...draft,password:'must-not-store'}})).status,400);
    assert.equal(outreachStore().list().length,0,'Saving drafts must not create runs');
    const reopened=new OutreachStore(process.env.CTX_OUTREACH_DB_PATH);
    try{assert.deepEqual(new CampaignRegistry(reopened).preferences().selection,selection);assert.deepEqual(readDemoPreferences(reopened).preferences,draft);assert.equal(readReplyTemplate(reopened,'demo').template,template);assert.equal(readReplyTemplate(reopened,'campaign').template,'<p>{{message}}</p>');}finally{reopened.db.close();}
  }finally{outreachStore().db.close();rmSync(directory,{recursive:true,force:true});}
});
