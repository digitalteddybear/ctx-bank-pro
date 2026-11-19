import assert from 'node:assert/strict';
import test from 'node:test';
import { ImapFlow } from 'imapflow';
import { fetchLatestInboundReply } from '../src/lib/server/outreach/transport/imap.ts';

test('catch-up skips acknowledged UIDs before fetching bodies and handles UIDVALIDITY rollover', async t => {
  process.env.GMAIL_USER='sender@example.test';
  process.env.GMAIL_APP_PASSWORD='isolated-test';
  const delivered=new Date('2026-11-01T12:00:00Z');
  const fetched=[];
  let validity=7;
  t.mock.method(ImapFlow.prototype,'connect',async function(){this.mailbox={uidValidity:validity};});
  t.mock.method(ImapFlow.prototype,'list',async()=>[]);
  t.mock.method(ImapFlow.prototype,'logout',async()=>{});
  t.mock.method(ImapFlow.prototype,'getMailboxLock',async()=>({release(){}}));
  t.mock.method(ImapFlow.prototype,'search',async(criteria, options)=>{
    assert.equal(options.uid,true);
    assert.ok(criteria.since <= delivered);
    assert.equal(criteria.seen,undefined);
    return [19,13,10];
  });
  t.mock.method(ImapFlow.prototype,'fetchOne',async(uid,query,options)=>{
    assert.equal(options.uid,true);
    fetched.push(uid);
    return {uid,internalDate:new Date(delivered.getTime()+uid*1000),envelope:{from:[{address:'prospect@example.test'}]},source:Buffer.from('Content-Type: text/plain\r\n\r\nMessage '+uid)};
  });
  const options={prospectEmail:'prospect@example.test',minDate:delivered,checkpoint:{validity:'7',uids:[10]}};
  const first=await fetchLatestInboundReply(options);
  assert.equal(first.uid,13);assert.deepEqual(fetched,[13]);
  options.checkpoint.uids.push(13);
  assert.equal((await fetchLatestInboundReply(options)).uid,19);
  validity=8;
  const reset=await fetchLatestInboundReply(options);
  assert.equal(reset.uid,10);assert.notEqual(reset.mailboxId,first.mailboxId);
});

test('same sender and subject cannot override an unrelated reply header', async t => {
  process.env.GMAIL_USER='sender@example.test';
  process.env.GMAIL_APP_PASSWORD='isolated-test';
  t.mock.method(ImapFlow.prototype,'connect',async function(){this.mailbox={uidValidity:1};});
  t.mock.method(ImapFlow.prototype,'list',async()=>[]);
  t.mock.method(ImapFlow.prototype,'logout',async()=>{});
  t.mock.method(ImapFlow.prototype,'getMailboxLock',async()=>({release(){}}));
  t.mock.method(ImapFlow.prototype,'search',async()=>[1,2,3]);
  const headers=['In-Reply-To: <unrelated@example.test>','References: <original@example.test>',''];
  t.mock.method(ImapFlow.prototype,'fetchOne',async uid=>({
    uid,internalDate:new Date(),envelope:{from:[{address:'prospect@example.test'}],subject:'Re: Introduction'},
    source:Buffer.from(headers[uid-1]+'\r\nContent-Type: text/plain\r\n\r\nHello')
  }));
  const options={prospectEmail:'prospect@example.test',thread:{messageIds:new Set(['<original@example.test>']),subjects:new Set(['introduction'])}};
  assert.equal((await fetchLatestInboundReply(options)).uid,2);
  options.processedUids=new Set([2]);
  assert.equal((await fetchLatestInboundReply(options)).uid,3);
  options.thread.subjects.clear();
  assert.equal(await fetchLatestInboundReply(options),null);
});

test('campaign reply survives interruption before CRM work and rolls back a partial CRM batch', async t => {
  const {OutreachStore}=await import('../src/lib/server/outreach/store.ts');
  const {OutreachEngine}=await import('../src/lib/server/outreach/engine.ts');
  const {FixtureModel}=await import('../src/lib/server/outreach/models.ts');
  const {flushInboundCrm,pollActiveInboundReplies}=await import('../src/lib/server/outreach/transport/imap.ts');
  const {mkdtempSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'ctx-crm-capture-')),file=join(dir,'workflows.sqlite');
  let store=new OutreachStore(file);
  try {
    const engine=new OutreachEngine(store,new FixtureModel());
    const email='prospect@example.test';
    const run=engine.create({id:'lead-123',email,name:'Recovery',permission:'granted',facts:[]});
    run.campaignId='simulation';run.status='waiting_reply';
    run.transcript.push({direction:'outbound',eventId:'opening',text:'Hello',subject:'Introduction',deliveryStatus:'sent',externalMessageId:'<opening@example.test>'});
    store.save(run);
    process.env.GMAIL_USER='sender@example.test';process.env.GMAIL_APP_PASSWORD='isolated-test';
    t.mock.method(ImapFlow.prototype,'connect',async function(){this.mailbox={uidValidity:1};});
    t.mock.method(ImapFlow.prototype,'list',async()=>[]);
  t.mock.method(ImapFlow.prototype,'logout',async()=>{});
    t.mock.method(ImapFlow.prototype,'getMailboxLock',async()=>({release(){}}));
    t.mock.method(ImapFlow.prototype,'search',async()=>[45]);
    t.mock.method(ImapFlow.prototype,'fetchOne',async()=>({uid:45,internalDate:new Date(),envelope:{from:[{address:email}],inReplyTo:'<opening@example.test>'},source:Buffer.from('Content-Type: text/plain\r\n\r\nUnsubscribe')}));
    t.mock.method(engine,'tick',async()=>{throw Error('Injected interruption');});
    await pollActiveInboundReplies({store,engine,liveCrm:false,liveSend:false});
    store.close();store=new OutreachStore(file);
    assert.equal(store.get(run.id).transcript.length,2);
    assert.ok(store.isSuppressed(email));
    assert.deepEqual(JSON.parse(store.setting('imap-checkpoint:'+email)).uids,[45]);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM pending_inbound_crm').get().n,1);
    store.db.exec("CREATE TRIGGER fail_status BEFORE INSERT ON crm_delivery_jobs WHEN NEW.kind='status' BEGIN SELECT RAISE(ABORT,'injected'); END;");
    assert.throws(()=>flushInboundCrm(store),/injected/);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM crm_delivery_jobs').get().n,0);
    store.db.exec('DROP TRIGGER fail_status');
    flushInboundCrm(store);flushInboundCrm(store);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM crm_delivery_jobs').get().n,3);
    assert.equal(JSON.parse(store.db.prepare("SELECT payload FROM crm_delivery_jobs WHERE kind='status'").get().payload).properties.ctx_status,'Opted Out');
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});

test('archived replies use localized All Mail and ignore colliding inbox UIDs',async t=>{
  process.env.GMAIL_USER='sender@example.test';process.env.GMAIL_APP_PASSWORD='isolated-test';
  t.mock.method(ImapFlow.prototype,'connect',async function(){this.mailbox={uidValidity:1};});
  t.mock.method(ImapFlow.prototype,'list',async()=>[{specialUse:'\\All',path:'[Gmail]/Tous les messages'}]);
  t.mock.method(ImapFlow.prototype,'logout',async()=>{});
  t.mock.method(ImapFlow.prototype,'getMailboxLock',async(path,options)=>{
    assert.equal(path,'[Gmail]/Tous les messages');assert.equal(options.readOnly,true);
    return {release(){}};
  });
  t.mock.method(ImapFlow.prototype,'search',async()=>[42,43]);
  t.mock.method(ImapFlow.prototype,'fetchOne',async uid=>({uid,internalDate:new Date(),envelope:{from:[{address:'prospect@example.test'}],messageId:uid===42?'<old@example.test>':'<new@example.test>'},source:Buffer.from('Content-Type: text/plain\r\n\r\nHello')}));
  const result=await fetchLatestInboundReply({prospectEmail:'prospect@example.test',includeArchived:true,checkpoint:{validity:'1',uids:[43]},recordedMessageIds:new Set(['<old@example.test>'])});
  assert.equal(result.uid,43);
  assert.equal(result.mailboxId,'sender@example.test:[Gmail]/Tous les messages:1');
});
