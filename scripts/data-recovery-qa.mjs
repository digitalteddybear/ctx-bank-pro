import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackup, restoreBackup } from './data-recovery.mjs';

test('WAL backup restores conversations, preferences, binary assets and private config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-recovery-'));
  const data = path.join(root, 'data'), config = path.join(root, 'config'), destination = path.join(root, 'backup');
  await mkdir(data); await mkdir(config);
  const db = new DatabaseSync(path.join(data, 'workflows.sqlite'));
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE state(id TEXT PRIMARY KEY,value TEXT); INSERT INTO state VALUES ('conversation','retained'),('template','<p>{{message}}</p>');");
    await writeFile(path.join(data, 'attachment.bin'), Buffer.from([0, 1, 255]));
    await writeFile(path.join(data, 'operator-journal'), 'Retain this non-SQLite journal');
    await writeFile(path.join(config, 'settings.enc'), 'encrypted-test-settings');
    await assert.rejects(createBackup({data, config, destination}), /Stop all/);
    const manifest = await createBackup({data, config, destination, writersStopped:true});
    assert.equal(manifest.files.length, 4);
    assert.ok(!manifest.files.some(file => /-wal|-shm/.test(file.path)));
    assert.ok(manifest.files.some(file => file.path === 'operator-journal'));
    const staging = path.join(root, 'restored');
    await restoreBackup({source:destination, destination:staging});
    const restored = new DatabaseSync(path.join(staging, 'data/workflows.sqlite'), {readOnly:true});
    try { assert.equal(restored.prepare('SELECT count(*) AS n FROM state').get().n, 2); } finally { restored.close(); }
    assert.deepEqual(await readFile(path.join(staging, 'data/attachment.bin')), Buffer.from([0,1,255]));
    assert.equal(await readFile(path.join(staging, 'config/settings.enc'), 'utf8'), 'encrypted-test-settings');
    assert.equal((await stat(path.join(staging, 'config/settings.enc'))).mode & 0o777, 0o600);
    await assert.rejects(restoreBackup({source:destination, destination:staging}), /EEXIST/);
    await writeFile(path.join(destination, 'config/settings.enc'), 'tampered');
    await assert.rejects(restoreBackup({source:destination, destination:path.join(root,'bad')}), /checksum/);
  } finally { db.close(); await rm(root, {recursive:true, force:true}); }
});

test('backup rejects symlinks and overlapping paths; restore rejects traversal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-recovery-'));
  const data = path.join(root,'data'); await mkdir(data);
  try {
    await assert.rejects(createBackup({data,destination:path.join(data,'backup'),writersStopped:true}), /overlap/);
    await symlink('/etc/passwd', path.join(data,'link'));
    await assert.rejects(createBackup({data,destination:path.join(root,'backup'),writersStopped:true}), /symbolic/);
    await assert.rejects(stat(path.join(root,'backup')), /ENOENT/);
    const source = path.join(root,'malformed'); await mkdir(source);
    await writeFile(path.join(source,'manifest.json'),JSON.stringify({version:1,roots:['data'],files:[{root:'data',path:'../escape',sqlite:false,sha256:'a'.repeat(64)}]}));
    await assert.rejects(restoreBackup({source,destination:path.join(root,'restore')}), /Invalid backup entry/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('CTX application stores recover in a fresh process without losing history or receipts', async () => {
  const { OutreachStore } = await import('../src/lib/server/outreach/store.ts');
  const { AIWorkspaceStore } = await import('../src/lib/server/ai-workspace-store.ts');
  const { saveAISettings } = await import('../src/lib/server/ai-settings-store.ts');
  const { DEFAULT_AI_SETTINGS } = await import('../src/lib/ai-settings.ts');
  const { saveDemoPreferences } = await import('../src/lib/server/outreach/demo-preferences.ts');
  const { HubSpotContextStore } = await import('../src/lib/server/integrations/hubspot-context.ts');
  const { execFileSync } = await import('node:child_process');
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-app-recovery-'));
  const data = path.join(root, 'data'); await mkdir(data);
  const store = new OutreachStore(path.join(data, 'workflows.sqlite'));
  const workspace = new AIWorkspaceStore(path.join(data, 'workspace.sqlite'));
  let closed = false;
  try {
    saveAISettings(store, { settings: {...DEFAULT_AI_SETTINGS, persona:'Code Auditor'}, revision:0 });
    saveDemoPreferences(store, { prospectName:'Recovery Prospect', prospectEmail:'recovery@example.test', hubspotContactId:'123', customSubject:'Saved subject', customBody:'Saved opening', replyHtmlTemplate:'<p>{{message}}</p>', liveSend:false, liveCrm:false, useLiveModel:false });
    const run = { id:'recovery-run', campaign:'relationship-reactivation', prospect:{id:'lead-123',name:'Recovery Prospect',email:'recovery@example.test',permission:'granted',facts:[]}, sandbox:true,synthetic:true,mode:'human',inference:'fixture',revision:0,status:'waiting_reply',next:'conversation',intent:'reply',corrections:0,draftCounter:0,followups:0,createdAt:Date.now(),transcript:[{direction:'outbound',text:'Hello',eventId:'sent-1',from:'sender@example.test',to:'recovery@example.test',deliveryStatus:'sent',externalMessageId:'<sent-1@example.test>'},{direction:'inbound',text:'Please call next month',eventId:'reply-1',from:'recovery@example.test',to:'sender@example.test'}] };
    store.save(run); store.enqueue(run,'conversation');
    store.event(run.id,'reply_received',{text:'Please call next month'});
    store.receipt('reply-1',{text:'Please call next month'});
    store.db.prepare('INSERT INTO suppressed VALUES (?,?)').run('optout@example.test','Requested stop');
    store.db.prepare("INSERT INTO crm_delivery_jobs(id,run_id,kind,payload,due) VALUES (?,?,?,?,?)").run('crm-1',run.id,'inbound','{}',Date.now());
    new HubSpotContextStore(store);
    const snapshot={hubspotId:'123',email:'recovery@example.test',revision:'revision-1',schemaVersion:'schema-1',observedAt:new Date().toISOString(),remoteUpdatedAt:new Date().toISOString(),properties:{firstname:'Recovery'},source:'HubSpot Contact API'};
    store.db.prepare("INSERT INTO crm_contacts(id,revision,data,index_state) VALUES (?,?,?,'ready')").run('123','revision-1',JSON.stringify(snapshot));
    const timestamp=new Date().toISOString(), chatId=crypto.randomUUID();
    workspace.createConversation({id:chatId,title:'Recovered chat',createdAt:timestamp,updatedAt:timestamp,messages:[{id:crypto.randomUUID(),role:'user',content:'Retain this history',createdAt:timestamp,status:'complete'}]});
    const artifactId=crypto.randomUUID();
    workspace.createArtifact({id:artifactId,conversationId:chatId,title:'Recovered document',type:'document',status:'draft',version:{artifactId,version:1,files:[{path:'notes.md',language:'markdown',content:'Retained artifact'}],sourceReferences:[],provenance:{provider:'test',model:'fixture',runId:crypto.randomUUID(),createdAt:timestamp,promptHash:'a'.repeat(64)},createdAt:timestamp}});
    store.db.close(); workspace.close(); closed=true;
    const source=path.join(root,'backup'), destination=path.join(root,'restore');
    await createBackup({data,destination:source,writersStopped:true});
    await restoreBackup({source,destination});
    const script=`
      import assert from 'node:assert/strict';
      import {OutreachStore} from './src/lib/server/outreach/store.ts';
      import {AIWorkspaceStore} from './src/lib/server/ai-workspace-store.ts';
      import {readAISettings} from './src/lib/server/ai-settings-store.ts';
      import {readDemoPreferences} from './src/lib/server/outreach/demo-preferences.ts';
      import {HubSpotContextStore} from './src/lib/server/integrations/hubspot-context.ts';
      const store=new OutreachStore(process.env.RECOVERY_DATA+'/workflows.sqlite');
      const workspace=new AIWorkspaceStore(process.env.RECOVERY_DATA+'/workspace.sqlite');
      try {
        assert.equal(readAISettings(store).settings.persona,'Code Auditor');
        assert.equal(readAISettings(store).revision,1);
        assert.equal(readDemoPreferences(store).preferences.customBody,'Saved opening');
        assert.equal(readDemoPreferences(store).template,'<p>{{message}}</p>');
        const run=store.get('recovery-run');
        assert.equal(run.prospect.name,'Recovery Prospect');
        assert.equal(run.transcript.length,2);
        assert.equal(run.transcript[0].externalMessageId,'<sent-1@example.test>');
        assert.equal(store.events(run.id)[0].kind,'reply_received');
        assert.equal(store.receipt('reply-1',{text:'Please call next month'}),false);
        assert.equal(store.isSuppressed('optout@example.test'),true);
        assert.equal(store.db.prepare("SELECT count(*) AS n FROM jobs WHERE state='queued'").get().n,1);
        assert.equal(store.db.prepare("SELECT count(*) AS n FROM crm_delivery_jobs WHERE state='queued'").get().n,1);
        assert.equal(new HubSpotContextStore(store).contact('123').indexState,'ready');
        const chat=workspace.listConversations()[0];
        assert.equal(chat.messages[0].content,'Retain this history');
        assert.equal(workspace.getArtifact(process.env.RECOVERY_ARTIFACT).version.files[0].content,'Retained artifact');
        console.log('Application recovery verified');
      } finally {store.db.close();workspace.close();}
    `;
    const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,RECOVERY_DATA:path.join(destination,'data'),RECOVERY_ARTIFACT:artifactId,CTX_WORKER_MODE:'external',CTX_LIVE_EMAIL_DISPATCH:'false',HUBSPOT_WRITES_ENABLED:'false'}});
    assert.match(output,/Application recovery verified/);
  } finally {
    if(!closed){store.db.close();workspace.close();}
    await rm(root,{recursive:true,force:true});
  }
});

test('workspace recovery preserves partial text, versions and replay sequence across competing connections',async()=>{
  const {AIWorkspaceStore}=await import('../src/lib/server/ai-workspace-store.ts');
  const root=await mkdtemp(path.join(os.tmpdir(),'ctx-workspace-restart-'));
  const filename=path.join(root,'workspace.sqlite');
  const writer=new AIWorkspaceStore(filename);
  let reader;
  try{
    const conversationId=crypto.randomUUID(),messageId=crypto.randomUUID(),id=crypto.randomUUID(),stamp=new Date().toISOString();
    writer.createConversation({id:conversationId,title:'Stream',createdAt:stamp,updatedAt:stamp,messages:[{id:messageId,role:'assistant',content:'',status:'streaming',createdAt:stamp}]});
    writer.createRun({id,requestId:id,conversationId,assistantMessageId:messageId});
    writer.appendMessageEvent(id,conversationId,messageId,{content:'First chunk',status:'streaming'},'text.delta',{text:'First chunk'});
    reader=new AIWorkspaceStore(filename);
    assert.equal(reader.getRun(id).status,'running');
    writer.db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON run_events BEGIN SELECT RAISE(ABORT,'Injected event failure'); END;");
    assert.throws(()=>writer.appendMessageEvent(id,conversationId,messageId,{content:'Dropped'},'text.delta',{text:'Dropped'}),/Injected/);
    writer.db.exec('DROP TRIGGER fail_event');
    assert.equal(reader.getConversation(conversationId).messages[0].content,'First chunk');
    assert.equal(reader.eventsAfter(id,0).length,1);
    const artifactId=crypto.randomUUID(),provenance={provider:'test',model:'test',runId:id,promptHash:'a'.repeat(64),createdAt:stamp};
    writer.createArtifact({id:artifactId,conversationId,title:'Document',type:'document',status:'draft',version:{artifactId,version:1,files:[{path:'draft.md',language:'markdown',content:'Version one'}],sourceReferences:[],provenance,createdAt:stamp}});
    writer.updateArtifact(artifactId,1,{files:[{path:'draft.md',language:'markdown',content:'Version two'}],provenance});
    // Simulate an unresponsive writer after its heartbeat deadline.
    writer.db.prepare('UPDATE workspace_run_leases SET expires_at=0 WHERE run_id=?').run(id);
    reader.close();reader=new AIWorkspaceStore(filename);
    assert.equal(reader.getRun(id).status,'failed');
    assert.equal(reader.getConversation(conversationId).messages[0].content,'First chunk');
    assert.equal(reader.getConversation(conversationId).messages[0].status,'error');
    assert.deepEqual(reader.eventsAfter(id,0).map(e=>[e.sequence,e.type]),[[1,'text.delta'],[2,'run.failed']]);
    assert.throws(()=>writer.appendMessageEvent(id,conversationId,messageId,{content:'Late'},'run.completed',{}),/finished/);
    assert.equal(reader.getArtifact(artifactId,1).version.files[0].content,'Version one');
    assert.equal(reader.getArtifact(artifactId).version.files[0].content,'Version two');
  }finally{reader?.close();writer.close();await rm(root,{recursive:true,force:true});}
});
