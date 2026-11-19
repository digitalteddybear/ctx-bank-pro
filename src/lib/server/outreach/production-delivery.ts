import { randomUUID } from "node:crypto";
import { fingerprint, usableSources, usableDeliverabilitySources } from "./sources";
import { z } from "zod";
import { OutreachStore } from "./store";
import { OutreachScheduler } from "./scheduler";
import { OutreachEngine } from "./engine";
import { ConfigurableModel } from "./models";
import { phase1SandboxProspect } from "./phase1";
import { crmEmailOptOut, HubSpotContextStore } from "../integrations/hubspot-context";
import { sendLiveOutreachEmail } from "./transport/email";
import { getHubSpotGateway } from "../integrations/hubspot-gateway";

function tables(store: OutreachStore) {
  store.transaction(()=>{
  store.db.exec("CREATE TABLE IF NOT EXISTS campaign_runs(lead_id TEXT NOT NULL,campaign_id TEXT NOT NULL,run_id TEXT NOT NULL UNIQUE,PRIMARY KEY(lead_id,campaign_id)); CREATE TABLE IF NOT EXISTS crm_delivery_jobs(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',due INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,error TEXT)");
    if(!store.db.prepare("PRAGMA table_info(crm_delivery_jobs)").all().some(column=>column.name==="claim_token"))store.db.exec("ALTER TABLE crm_delivery_jobs ADD COLUMN claim_token TEXT");
  });
}
/** Campaigns resolve existing CRM records; this boundary never creates contacts. */
export function validateCampaignContact(store:OutreachStore,leadId:string,email:string){
  const hubspotId=leadId.replace(/^lead-/, "");
  if(!/^\d+$/.test(hubspotId))throw new Error("An existing numeric HubSpot Contact ID is required.");
  const crm=new HubSpotContextStore(store).contact(hubspotId);
  if(!crm||crm.error||crm.snapshot.hubspotId!==hubspotId||crm.snapshot.email.trim().toLowerCase()!==email.trim().toLowerCase())throw new Error("Synchronize the matching existing HubSpot contact before launch.");
  if(crm.indexState!=="ready")throw new Error("Wait for this HubSpot contact's knowledge index to finish before launch.");
  if(crmEmailOptOut(crm.snapshot.properties))
    throw new Error("HubSpot records an opt-out for this contact.");
  return crm;
}
export async function materializeCampaignRuns(store: OutreachStore, resolveLead: typeof phase1SandboxProspect = phase1SandboxProspect) {
  tables(store);
  if(!store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_enrollments'").get())return;
  const rows=store.db.prepare("SELECT e.* FROM campaign_enrollments e LEFT JOIN campaign_runs r ON r.lead_id=e.lead_id AND r.campaign_id=e.campaign_id WHERE e.state='queued' AND r.run_id IS NULL LIMIT 5").all();
  if(rows.length){try{usableSources(store,"live");usableDeliverabilitySources(store,"live");}catch{return;}}
  for(const row of rows){
    const campaignId=String(row.campaign_id),leadId=String(row.lead_id);
    if(store.setting("campaign-paused:"+campaignId)==="true")continue;
    try{
      const lead=await resolveLead(leadId);
      store.transaction(()=>{
        // Hydration awaits disk/index work. Recheck operator changes under the write lock.
        const current=store.db.prepare("SELECT email,state FROM campaign_enrollments WHERE lead_id=? AND campaign_id=?").get(leadId,campaignId);
        if(!current || current.state!=="queued" || store.setting("campaign-paused:"+campaignId)==="true")return;
        if(store.db.prepare("SELECT run_id FROM campaign_runs WHERE lead_id=? AND campaign_id=?").get(leadId,campaignId))return;
        if(store.isSuppressed(lead.email))throw new Error("Contact opted out before enrollment.");
        usableSources(store,"live");
        usableDeliverabilitySources(store,"live");
        const launch=z.object({permissionGranted:z.literal(true),permissionReference:z.string().min(1),mode:z.enum(["review-required","autonomous-paced"])}).parse(JSON.parse(String(store.setting("campaign-launch:"+campaignId))));
        if(lead.email.toLowerCase()!==String(current.email).toLowerCase())throw new Error("Canonical lead email changed; review cohort identity.");
        const crm=validateCampaignContact(store,leadId,lead.email);
        const runId="campaign-"+campaignId+"-"+leadId;
        const settings=String(store.setting("campaign-settings:"+campaignId)??"{}");
        const parsed=z.object({replyHtmlTemplate:z.string().optional()}).passthrough().parse(JSON.parse(settings));
        store.setSetting("campaign-run-settings:"+runId,settings);
        store.setSetting("reply-html-template:"+runId,parsed.replyHtmlTemplate??"");
        store.setSetting("campaign-crm-contact:"+crm.snapshot.hubspotId,JSON.stringify({email:lead.email,campaignId,permissionReference:launch.permissionReference}));
        const engine=new OutreachEngine(store,new ConfigurableModel());
        const run=engine.createCampaignProspect({...lead,permission:"granted"},launch.mode==="autonomous-paced"?"automatic":"human",campaignId);
        store.db.prepare("INSERT OR IGNORE INTO campaign_runs VALUES(?,?,?)").run(leadId,campaignId,run.id);
        store.event(run.id,"campaign_enrolled",{campaignId,permissionReference:launch.permissionReference,crmRevision:crm.snapshot.revision});
      });
    }catch(error){
      const reason=error instanceof Error?error.message:"Campaign enrollment failed.";
      store.transaction(()=>{
        const changed=store.db.prepare("UPDATE campaign_enrollments SET state='held',reason=? WHERE lead_id=? AND campaign_id=? AND state='queued' AND NOT EXISTS (SELECT 1 FROM campaign_runs WHERE lead_id=? AND campaign_id=?)").run(reason,leadId,campaignId,leadId,campaignId);
        if(changed.changes)store.event(campaignId,"enrollment_failed",{leadId,reason});
      });
    }
  }
}
export function queueCrmJob(store:OutreachStore,id:string,runId:string,kind:"outbound"|"status"|"inbound"|"briefing",payload:unknown){
  tables(store);
  store.db.prepare("INSERT OR IGNORE INTO crm_delivery_jobs(id,run_id,kind,payload,due) VALUES(?,?,?,?,?)").run(id,runId,kind,JSON.stringify(payload),Date.now());
}
type CrmWorkerGateway = Pick<ReturnType<typeof getHubSpotGateway>, "logEmailEngagement" | "logReplyEngagement" | "logBrokerBriefingNote" | "updateOutreachStatus">;
export async function processCrmJobs(store:OutreachStore, gatewayFactory:()=>CrmWorkerGateway=getHubSpotGateway){
  tables(store);
  if(process.env.HUBSPOT_WRITES_ENABLED!=="true")return;
  const job=store.transaction(()=>{
    store.db.prepare("UPDATE crm_delivery_jobs SET state=CASE WHEN kind='status' THEN 'queued' ELSE 'uncertain' END,error='Worker stopped during CRM operation; reconcile before retry',lease=0,claim_token=NULL WHERE state='running' AND lease<?").run(Date.now());
    const row=store.db.prepare("SELECT * FROM crm_delivery_jobs WHERE state='queued' AND due<=? ORDER BY due LIMIT 1").get(Date.now());
    if(!row)return;
    const claimToken=randomUUID();
    store.db.prepare("UPDATE crm_delivery_jobs SET state='running',lease=?,attempts=attempts+1,claim_token=? WHERE id=?").run(Date.now()+120000,claimToken,row.id);
    return {id:String(row.id),run_id:String(row.run_id),kind:String(row.kind),payload:String(row.payload),attempts:Number(row.attempts),claimToken};
  });
  if(!job)return;
  try{
    const gateway=gatewayFactory(),payload:unknown=JSON.parse(String(job.payload));
    const result=job.kind==="outbound"?await gateway.logEmailEngagement(payload):job.kind==="inbound"?await gateway.logReplyEngagement(payload):job.kind==="briefing"?await gateway.logBrokerBriefingNote(z.object({hubspotId:z.string(),email:z.string(),messageId:z.string(),stage:z.string(),evidenceSource:z.literal("Cal.com").optional(),prospectQuote:z.string(),agentBrief:z.string(),talkingPoints:z.array(z.string())}).parse(payload)):await gateway.updateOutreachStatus(payload);
    if(result.status!=="applied"&&result.decision!=="DENIED_IDEMPOTENT_DUPLICATE"){
      if(job.kind!=="status"&&result.decision==="ERROR_HTTP_FAILURE"){
        store.db.prepare("UPDATE crm_delivery_jobs SET state='uncertain',lease=0,error=?,claim_token=NULL WHERE id=? AND state='running' AND claim_token=?").run(result.error??"CRM outcome is uncertain.",job.id,job.claimToken);
        return;
      }
      // An explicit rejection confirms no mutation; it can safely retry after configuration changes.
      store.db.prepare("UPDATE crm_delivery_jobs SET state=?,due=?,lease=0,error=?,claim_token=NULL WHERE id=? AND state='running' AND claim_token=?").run(Number(job.attempts)>=7?"failed":"queued",Date.now()+Math.min(3600000,30000*2**Number(job.attempts)),(result.error??"CRM update did not apply.").slice(0,500),job.id,job.claimToken);
      return;
    }
    store.db.prepare("UPDATE crm_delivery_jobs SET state='applied',lease=0,error=NULL,claim_token=NULL WHERE id=? AND state='running' AND claim_token=?").run(job.id,job.claimToken);
  }catch(error){
    const message=error instanceof Error?error.message:"CRM synchronization failed.";
    const state=job.kind!=="status"?"uncertain":Number(job.attempts)>=7?"failed":"queued";
    store.transaction(()=>{
      const changed=store.db.prepare("UPDATE crm_delivery_jobs SET state=?,due=?,lease=0,error=?,claim_token=NULL WHERE id=? AND state='running' AND claim_token=?").run(state,Date.now()+Math.min(3600000,30000*2**Number(job.attempts)),message.slice(0,500),job.id,job.claimToken);
      if(changed.changes)store.event(String(job.run_id),state==="uncertain"?"crm_reconciliation_required":"crm_retry_pending",{id:job.id,message});
    });
  }
}
export async function processProductionDelivery(store:OutreachStore,send:typeof sendLiveOutreachEmail=sendLiveOutreachEmail){
  const sender=process.env.GMAIL_USER;
  if(process.env.CTX_LIVE_EMAIL_DISPATCH!=="true"||!sender)return;
  const scheduler=new OutreachScheduler(store);
  for(const run of store.list().filter(run=>run.campaignId&&!run.sandbox&&!run.synthetic&&run.inference==="live")){
    for(const turn of run.transcript.filter(turn=>turn.direction==="outbound"&&turn.deliveryStatus==="queued")){
      scheduler.enqueue({id:turn.eventId,runId:run.id,sender,kind:run.transcript.some(previous=>previous.direction==="inbound")?"reply":"initial"});
    }
  }
  const delivery=scheduler.claim(sender);
  if(!delivery)return;
  const run=store.get(delivery.runId);
  if(!run.campaignId||run.sandbox||run.synthetic){scheduler.finish(delivery,"uncertain",Date.now(),"Delivery is not an active production campaign.");return;}
  const turn=run.transcript.find(turn=>turn.eventId===delivery.id);
  if(!turn){scheduler.finish(delivery,"uncertain",Date.now(),"Queued content is missing.");return;}
  if(!run.draft||turn.eventId!==run.id+":"+run.draft.version||turn.text!==run.draft.body||run.review?.decision!=="pass"||run.review.draftHash!==run.draft.hash||(run.mode==="human"&&run.approval?.draftHash!==run.draft.hash)){
    store.db.prepare("UPDATE delivery_queue SET state='cancelled',error='Draft or approval was superseded' WHERE id=?").run(delivery.id);
    return;
  }
  try{if(run.review.sourceFingerprint!==fingerprint(usableSources(store,"live")))throw new Error("Source version changed.");}
  catch{store.db.prepare("UPDATE delivery_queue SET state='cancelled',error='Compliance evidence changed; review required' WHERE id=?").run(delivery.id);run.status="held";run.issue="Compliance evidence changed; review the draft again.";store.save(run);return;}
  try {
    const leadId=run.prospect.phase1LeadId??run.prospect.id;
    const crm=validateCampaignContact(store,leadId,run.prospect.email);
    const grant=store.setting("campaign-crm-contact:"+crm.snapshot.hubspotId);
    const permission=z.object({email:z.string(),campaignId:z.string(),permissionReference:z.string().trim().min(1)})
      .safeParse(grant ? JSON.parse(String(grant)) : null);
    if(run.prospect.permission!=="granted" || !permission.success ||
       permission.data.campaignId!==run.campaignId ||
       permission.data.email.trim().toLowerCase()!==run.prospect.email.trim().toLowerCase())
      throw new Error("Review this contact's campaign permission before sending.");
  } catch(error) {
    const reason=error instanceof Error?error.message:"Contact authorization unavailable.";
    store.transaction(()=>{
      const cancelled=store.db.prepare("UPDATE delivery_queue SET state='cancelled',error=?,lease=0 WHERE id=? AND owner=? AND state='sending'")
        .run(reason,delivery.id,delivery.owner??"");
      if(cancelled.changes){
        run.status="held";run.issue=reason;store.save(run);
        store.event(run.id,"delivery_authorization_held",{deliveryId:delivery.id,reason});
      }
    });
    return;
  }
  const previous=run.transcript.filter(item=>item.deliveryStatus==="sent"&&item.externalMessageId).map(item=>item.externalMessageId!);
  const reply=run.transcript.some(item=>item.direction==="inbound");
  try{
    const result=await send({to:run.prospect.email,subject:turn.subject??"",text:turn.text,runId:run.id,phase1LeadId:run.prospect.phase1LeadId,phase1Validated:run.prospect.phase1Validated,messageId:delivery.messageId,inReplyTo:run.transcript.filter(item=>item.direction==="inbound").at(-1)?.externalMessageId??previous.at(-1),references:Array.from(new Set([...previous,...run.transcript.filter(item=>item.direction==="inbound"&&item.externalMessageId).map(item=>item.externalMessageId!)])),intent:reply?"reply":"initial",htmlTemplate:String(store.setting("reply-html-template:"+run.id)??"")});
    if(!result.sent){scheduler.finish(delivery,"uncertain",Date.now(),result.error);return;}
    store.transaction(()=>{
    store.recordEmailDelivery(run.id,turn.eventId,{from:sender,fromName:process.env.CTX_SENDER_NAME??"Dylan",to:run.prospect.email,subject:turn.subject??"",sentAt:new Date().toISOString(),externalMessageId:result.messageId??delivery.messageId});
    const hubspotId=(run.prospect.phase1LeadId??run.prospect.id).replace(/^lead-/,"");
    queueCrmJob(store,delivery.id+":email",run.id,"outbound",{hubspotId,email:run.prospect.email,messageId:result.messageId??delivery.messageId,approvedBy:"campaign-worker",subject:turn.subject??"",bodyText:turn.text,sentAt:new Date().toISOString(),threadId:run.id});
    queueCrmJob(store,delivery.id+":status",run.id,"status",{hubspotId,email:run.prospect.email,messageId:delivery.id+":status",approvedBy:"campaign-worker",properties:{ctx_status:reply?"Replied":"Dispatched",ctx_last_contact:new Date().toISOString(),ctx_booking_link_sent:turn.text.includes("cal.com")}});
    scheduler.finish(delivery,"accepted");
    });
  }catch(error){if(store.db.prepare("SELECT state FROM delivery_queue WHERE id=?").get(delivery.id)?.state==="sending")scheduler.finish(delivery,"uncertain",Date.now(),error instanceof Error?error.message:"Delivery interrupted.");}
}

export function deliveryOperations(store:OutreachStore){
  tables(store);
  const hasDelivery=store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='delivery_queue'").get();
  return {
    sources:store.sourceList().map(source=>({id:source.id,title:source.title,ready:!source.fixture&&!source.changed&&Boolean(source.approvedBy),checkedAt:source.checkedAt})),
    heartbeat:Number(store.setting("worker-heartbeat")??0),
    deliveries:hasDelivery?store.db.prepare("SELECT id,run_id,state,error FROM delivery_queue WHERE state!='accepted' ORDER BY due LIMIT 30").all():[],
    crm:store.db.prepare("SELECT id,run_id,kind,state,error,attempts FROM crm_delivery_jobs WHERE state!='applied' ORDER BY due LIMIT 30").all(),
  };
}
export function resolveCrmJob(store:OutreachStore,id:string,resolution:"retry"|"applied"){
  tables(store);
  store.transaction(()=>{
  const row=store.db.prepare("SELECT state,run_id FROM crm_delivery_jobs WHERE id=?").get(id);
  if(!row||!["failed","uncertain"].includes(String(row.state)))throw new Error("Only failed or uncertain CRM jobs may be resolved.");
  store.db.prepare("UPDATE crm_delivery_jobs SET state=?,attempts=0,due=?,lease=0,error=NULL,claim_token=NULL WHERE id=?").run(resolution==="retry"?"queued":"applied",Date.now(),id);
  store.event(String(row.run_id),"operator_crm_resolution",{id,resolution});
  });
}

export async function reconcileDelivery(store:OutreachStore,id:string,lookup?: (messageId:string)=>Promise<boolean>){
  const row=store.db.prepare("SELECT * FROM delivery_queue WHERE id=? AND state='uncertain'").get(id);
  if(!row)throw new Error("Delivery is not uncertain.");
  const sentMessageExists=lookup ?? (await import("./transport/imap")).sentMessageExists;
  const found=await sentMessageExists(String(row.message_id));
  return store.transaction(()=>{
  const current=store.db.prepare("SELECT owner FROM delivery_queue WHERE id=? AND state='uncertain'").get(id);
  if(!current || current.owner!==row.owner)throw new Error("Delivery attempt changed while checking Sent mail.");
  store.setSetting("delivery-check:"+id,JSON.stringify({found,at:Date.now(),owner:row.owner}));
  if(found){
    const run=store.get(String(row.run_id)),turn=run.transcript.find(message=>message.eventId===id);
    if(!turn)throw new Error("Stored email content was not found.");
    store.transaction(()=>{
    const sender=String(row.sender),hubspotId=(run.prospect.phase1LeadId??run.prospect.id).replace(/^lead-/,"");
    store.recordEmailDelivery(run.id,id,{from:sender,fromName:process.env.CTX_SENDER_NAME??"Dylan",to:run.prospect.email,subject:turn.subject??"",sentAt:turn.sentAt??new Date().toISOString(),externalMessageId:String(row.message_id)});
    queueCrmJob(store,id+":email",run.id,"outbound",{hubspotId,email:run.prospect.email,messageId:String(row.message_id),approvedBy:"delivery-reconciliation",subject:turn.subject??"",bodyText:turn.text,sentAt:turn.sentAt??new Date().toISOString(),threadId:run.id});
    queueCrmJob(store,id+":status",run.id,"status",{hubspotId,email:run.prospect.email,messageId:id+":status",approvedBy:"delivery-reconciliation",properties:{ctx_status:run.transcript.some(message=>message.direction==="inbound")?"Replied":"Dispatched",ctx_last_contact:turn.sentAt??new Date().toISOString(),ctx_booking_link_sent:turn.text.includes("cal.com")}});
    store.db.prepare("UPDATE delivery_queue SET state='accepted',error=NULL,accepted_at=? WHERE id=?").run(Date.now(),id);
    });
  }
  store.event(String(row.run_id),"delivery_reconciled",{id,found});
  return {found};
  });
}
export function retryDelivery(store:OutreachStore,id:string){
  return store.transaction(()=>{
  const check=JSON.parse(String(store.setting("delivery-check:"+id)??"null")) as {found:boolean;at:number;owner?:string}|null;
  if(!check||check.found||Date.now()-check.at>600000)throw new Error("Check Sent mail before retrying an uncertain delivery.");
  const row=store.db.prepare("SELECT run_id,owner FROM delivery_queue WHERE id=? AND state='uncertain'").get(id);
  if(!row)throw new Error("Delivery is not uncertain.");
  if(check.owner!==row.owner)throw new Error("Check Sent mail for the current delivery attempt.");
  store.db.prepare("UPDATE delivery_queue SET state='queued',due=?,lease=NULL,owner=NULL,error=NULL WHERE id=?").run(Date.now(),id);
  store.setSetting("delivery-check:"+id,"null");
  store.event(String(row.run_id),"operator_delivery_retry",{id});
  });
}
