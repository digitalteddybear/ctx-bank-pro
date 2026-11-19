import { crmEmailOptOut } from '../integrations/hubspot-context';
import { aiSettingsSchema } from '@/lib/ai-settings';
import { saveReplyTemplate } from './reply-template-store';
import { randomUUID } from 'node:crypto';
import { loadLeadGraph } from '../lead-corpus';
import { OutreachStore, hash } from './store';
import { readDeliveryLimits } from './scheduler';
import { campaignPreferencesSchema, campaignInputSchema, campaignSummarySchema, type campaignSegmentSchema } from '@/lib/outreach-campaign-contract';
import { z } from 'zod';
import type { KnowledgeNode } from '@/lib/graph/types';
import { interpolateOpeningMessage, openingMessageFieldsFromText, type OpeningMessageFields } from './message-template';

type Segment=z.infer<typeof campaignSegmentSchema>;
const cohorts:{id:Segment;label:string;match:(node:KnowledgeNode)=>boolean}[]=[
  {id:'all',label:'All Phase 1',match:()=>true},
  {id:'b2b-corporate',label:'B2B Corporate',match:n=>n.tags.includes('B2B_CORPORATE')},
  {id:'b2b-institutional',label:'B2B Institutional',match:n=>n.tags.includes('B2B_INSTITUTIONAL')},
  {id:'b2c-personal',label:'B2C Personal',match:n=>n.tags.includes('B2C_PERSONAL')},
  {id:'dual-channel',label:'Dual Channel',match:n=>n.tags.includes('DUAL_CHANNEL_REACHABLE')},
];
function email(node:KnowledgeNode){return (node.sources[0]?.excerpt?.match(/^# Contact Email:\s*`([^`]+)`/m)?.[1]??node.tags.find(t=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t))??'').trim().toLowerCase();}
export class CampaignRegistry {
  constructor(readonly store:OutreachStore){store.db.exec(`CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,payload_hash TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS campaign_enrollments(lead_id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,campaign_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL); CREATE TABLE IF NOT EXISTS outreach_preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);`);}
  list(){return this.store.db.prepare('SELECT data FROM campaigns ORDER BY rowid DESC LIMIT 100').all().map(row=>campaignSummarySchema.parse(JSON.parse(String(row.data))));}
  control(id:string,action:'pause-batch'|'resume-batch'|'cancel-batch') {
    return this.store.transaction(()=>{
      const row=this.store.db.prepare('SELECT data FROM campaigns WHERE id=?').get(id);
      if(!row)throw new Error('Batch not found.');
      const batch=campaignSummarySchema.parse(JSON.parse(String(row.data)));
      if(batch.status==='cancelled')throw new Error('Cancelled campaigns cannot be resumed. Create a new campaign.');
      const launch=JSON.parse(String(this.store.setting('campaign-launch:'+id)??'{}')) as {permissionGranted?:boolean};
      const status=action==='cancel-batch'?'cancelled':action==='pause-batch'?'paused':launch.permissionGranted?'queued':'held';
      this.store.setSetting('campaign-paused:'+id,String(action!=='resume-batch'));
      if(batch.status===status)return batch;
      batch.status=status;
      batch.reason=action==='cancel-batch'?'Cancelled by operator.':action==='pause-batch'?'Paused by operator.':launch.permissionGranted?null:'Contact permission records required.';
      this.store.db.prepare('UPDATE campaigns SET data=? WHERE id=?').run(JSON.stringify(batch),id);
      this.store.db.prepare('UPDATE campaign_enrollments SET state=?,reason=? WHERE campaign_id=?').run(status,batch.reason??'',id);
      if(action==='cancel-batch'){
        for(const run of this.store.list().filter(run=>run.campaignId===id)){
          this.store.cancel(run.id);run.status='held';run.issue='Campaign cancelled by operator.';this.store.save(run);
          if(this.store.db.prepare("SELECT name FROM sqlite_master WHERE name='delivery_queue'").get())this.store.db.prepare("UPDATE delivery_queue SET state='cancelled',error='Campaign cancelled' WHERE run_id=? AND state='queued'").run(run.id);
        }
      }
      this.store.event(id,action,{status,externalDelivery:false});
      return batch;
    });
  }
  private crmOptOutIds(){
    const ids=new Set<string>();
    if(!this.store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='crm_contacts'").get())return ids;
    const rows=this.store.db.prepare("SELECT id,json_extract(data,'$.properties.hs_email_optout') AS optout,json_extract(data,'$.properties.ctx_status') AS status FROM crm_contacts").all();
    for(const row of rows){
      if(crmEmailOptOut({hs_email_optout:String(row.optout??""),ctx_status:String(row.status??"")}))
        ids.add("lead-"+row.id);
    }
    return ids;
  }
  async overview(){
    const nodes=(await loadLeadGraph()).nodes.filter(n=>n.id.startsWith('lead-')&&!n.deletedAt);
    const hasCrmTable=Boolean(this.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='crm_contacts'").get());
    const crmRows=hasCrmTable?this.store.db.prepare("SELECT id,index_state FROM crm_contacts WHERE error IS NULL").all():[];
    const crmSynced=new Set(crmRows.map(r=>String(r.id)));
    const crmIndexed=new Set(crmRows.filter(r=>r.index_state==="ready").map(r=>String(r.id)));
    const enrolled=new Set(this.store.db.prepare("SELECT lead_id FROM campaign_enrollments WHERE state!='cancelled'").all().map(r=>String(r.lead_id)));
    const enrolledEmails=new Set(this.store.db.prepare("SELECT email FROM campaign_enrollments WHERE state!='cancelled'").all().map(r=>String(r.email)));
    const crmOptOuts=this.crmOptOutIds();
    const summaries=cohorts.map(cohort=>{
      const matching=nodes.filter(cohort.match);let suppressed=0,existing=0,available=0;
      for(const node of matching){const address=email(node);if(crmOptOuts.has(node.id)||this.store.isSuppressed(address))suppressed++;else if(enrolled.has(node.id)||enrolledEmails.has(address))existing++;else if(address)available++;}
      return {id:cohort.id,label:cohort.label,total:matching.length,available,suppressed,enrolled:existing,held:available,crmSynced:matching.filter(n=>crmSynced.has(n.id.slice(5))).length,crmIndexed:matching.filter(n=>crmIndexed.has(n.id.slice(5))).length};
    });
    const limits = readDeliveryLimits(this.store);
    const ramp = Array.from({ length: Math.ceil(nodes.length / limits.dailyStarts) }, (_, day) =>
      Math.min(limits.dailyStarts, nodes.length - day * limits.dailyStarts));
    return {cohorts:summaries,batches:this.list(),ramp,totalEmailCap:limits.dailyTotal,readiness:['Contact permission records required.','Existing HubSpot Contact ID and matching email required.']};
  }
  async templateContacts(segment:Segment){
    const cohort=cohorts.find(item=>item.id===segment)!;
    const nodes=(await loadLeadGraph()).nodes.filter(node=>node.id.startsWith('lead-')&&!node.deletedAt&&email(node)&&cohort.match(node));
    return nodes.map(node=>({id:node.id,label:node.label}));
  }
  async previewTemplate(segment:Segment,leadId:string,template:string){
    const cohort=cohorts.find(item=>item.id===segment)!;
    const node=(await loadLeadGraph()).nodes.find(item=>item.id===leadId&&item.id.startsWith('lead-')&&!item.deletedAt&&email(item)&&cohort.match(item));
    if(!node)throw new Error('Preview contact is not in the selected cohort.');
    const preferences=this.preferences();
    const fields:OpeningMessageFields=openingMessageFieldsFromText(node.label,node.sources.map(source=>source.excerpt??"").join("\n"),{standardFooter:preferences.standardFooter,contactProperties:node.crmContext?.properties});
    const preview=interpolateOpeningMessage(template,fields);
    return {leadId:node.id,leadName:node.label,...preview};
  }
  preferences(){const row=this.store.db.prepare("SELECT value FROM outreach_preferences WHERE key='campaign'").get();return campaignPreferencesSchema.parse(row?JSON.parse(String(row.value)):{openingMessage:"",standardFooter:"",replyHtmlTemplate:"",replyObjectives:["answer-questions"],replyRules:[{id:"tone",enabled:true},{id:"no-advice",enabled:true},{id:"no-promises",enabled:true},{id:"no-pressure",enabled:true},{id:"use-evidence",enabled:true},{id:"opt-out",enabled:true},{id:"liaison-role",enabled:true}],updatedAt:null});}
  savePreferences(raw:unknown){
    const value=campaignPreferencesSchema.omit({updatedAt:true}).extend({selection:campaignPreferencesSchema.shape.selection.removeDefault().optional(),deliveryLimits:campaignPreferencesSchema.shape.deliveryLimits.removeDefault().optional()}).strict().parse(raw);
    return this.store.transaction(()=>{const stored={...value,selection:value.selection??this.preferences().selection,deliveryLimits:value.deliveryLimits??this.preferences().deliveryLimits,updatedAt:new Date().toISOString()};saveReplyTemplate(this.store,"campaign",stored.replyHtmlTemplate);this.store.db.prepare("INSERT INTO outreach_preferences VALUES ('campaign',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(JSON.stringify(stored),stored.updatedAt);return stored;});
  }
  async start(raw:unknown){
    const input=campaignInputSchema.parse(raw);const digest=hash(input);
    const nodes=(await loadLeadGraph()).nodes.filter(n=>n.id.startsWith('lead-')&&!n.deletedAt&&cohorts.find(c=>c.id===input.segment)!.match(n));
    return this.store.transaction(()=>{
      const previous=this.store.db.prepare('SELECT payload_hash,data FROM campaigns WHERE request_id=?').get(input.requestId);
      if(previous){if(previous.payload_hash!==digest)throw new Error('Request ID reused with different batch settings.');return campaignSummarySchema.parse(JSON.parse(String(previous.data)));}
      const id=randomUUID();let selected=0;
      if(input.permissionGranted){
        if(!input.permissionReference.trim())throw new Error('Add the contact permission reference.');
        const preferences=this.preferences();
        if(!preferences.openingMessage.trim()||!preferences.replyHtmlTemplate.trim()||!preferences.replyObjectives.length)throw new Error('Save the opening message, reply HTML and reply objectives before launch.');
        const configured=aiSettingsSchema.safeParse(JSON.parse(String(this.store.setting('lead-outreach-settings')??'null')));
        if(!configured.success||!configured.data.models.leadOutreach.model.trim()||['auto','openai-oauth'].includes(configured.data.models.leadOutreach.provider))throw new Error('Configure and test a dedicated API model in AI Settings before launch.');
      }
      this.store.setSetting('campaign-launch:'+id,JSON.stringify(input));
      this.store.setSetting('campaign-settings:'+id,JSON.stringify(this.preferences()));
      const crmOptOuts=this.crmOptOutIds();
      for(const node of nodes){if(selected>=input.batchSize)break;const address=email(node);if(!address||crmOptOuts.has(node.id)||this.store.isSuppressed(address))continue;
        const result=this.store.db.prepare("INSERT OR IGNORE INTO campaign_enrollments(lead_id,email,campaign_id,state,reason) VALUES(?,?,?,'held','Contact permission records required') ON CONFLICT(lead_id) DO UPDATE SET email=excluded.email,campaign_id=excluded.campaign_id,state=excluded.state,reason=excluded.reason WHERE campaign_enrollments.state='cancelled'").run(node.id,address,id);if(input.permissionGranted)this.store.db.prepare("UPDATE campaign_enrollments SET state='queued',reason='' WHERE lead_id=? AND campaign_id=?").run(node.id,id);selected+=Number(result.changes);
      }
      const batch={id,requested:input.batchSize,selected,segment:input.segment,mode:input.mode,status:input.permissionGranted?'queued' as const:'held' as const,createdAt:new Date().toISOString(),reason:selected?(input.permissionGranted?null:'Contact permission records required. No emails have been queued.'):'No unallocated contacts available in this cohort.'};
      this.store.db.prepare('INSERT INTO campaigns VALUES(?,?,?,?)').run(id,input.requestId,digest,JSON.stringify(batch));this.store.event(id,'campaign_prepared',{...batch,inference:'live',externalDelivery:false});return batch;
    });
  }
}
