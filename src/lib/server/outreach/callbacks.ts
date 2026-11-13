import type {OutreachStore} from "./store";
import type {Run} from "./types";
export type CallbackTask={id:string;runId:string;sourceEventId:string;requestedText:string;dueAt:string|null;channel:string;status:"scheduled"|"needs_details"|"draft_ready"|"cancelled";createdAt:string};
export function callbackTask(store:OutreachStore,id:string):CallbackTask|undefined {const raw=store.setting(`callback:${id}`);return raw?JSON.parse(String(raw)) as CallbackTask:undefined;}
export function relativeCallback(text:string,at:string){const match=text.match(/\bin\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i);if(!match)return null;const date=new Date(at),n=Number(match[1]);if(!Number.isFinite(date.getTime())||n<1||n>365)return null;
 if(/month|year/i.test(match[2])){const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+n*(/year/i.test(match[2])?12:1));const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,end));}else date.setUTCDate(date.getUTCDate()+n*(/week/i.test(match[2])?7:1));return date.toISOString();}
export function saveCallback(store:OutreachStore,run:Run,dueAt:string|null,channel="unspecified") {const inbound=run.transcript.filter(t=>t.direction==="inbound").at(-1)!;const existing=callbackTask(store,run.id);if(existing?.sourceEventId===inbound.eventId)return existing;
 const valid=dueAt&&Date.parse(dueAt)>Date.parse(inbound.sentAt??new Date().toISOString())?dueAt:null;
 const task:CallbackTask={id:`callback:${run.id}:${inbound.eventId}`,runId:run.id,sourceEventId:inbound.eventId,requestedText:inbound.text,dueAt:valid,channel,status:valid?"scheduled":"needs_details",createdAt:new Date().toISOString()};run.callback={dueAt:task.dueAt,status:task.status,channel:task.channel};store.setSetting(`callback:${run.id}`,JSON.stringify(task));store.event(run.id,"callback_saved",task);return task;}
export function processDueCallbacks(store:OutreachStore,now=Date.now()) {
 for(const row of store.db.prepare("SELECT value FROM settings WHERE key LIKE 'callback:%'").all()){
  const task=JSON.parse(String(row.value)) as CallbackTask;if(task.status!=="scheduled"||!task.dueAt||Date.parse(task.dueAt)>now)continue;
  store.transaction(()=>{const latest=callbackTask(store,task.runId);if(latest?.status!=="scheduled")return;const run=store.get(task.runId);
   if(run.humanManaged||store.isSuppressed(run.prospect.email)||["suppressed","booked","failed","escalated"].includes(run.status)){task.status="cancelled";}
   else if(run.status==="paused"||store.setting("paused")==="true"||store.setting("campaign-paused")==="true")return;
   else if(!["waiting_reply","held","booking_pending"].includes(run.status))return;
   else{store.cancel(run.id);run.revision++;run.mode="human";run.intent="followup";run.draft=undefined;run.corrections=0;store.enqueue(run,"outreach");task.status="draft_ready";store.event(run.id,"callback_review_due",{taskId:task.id});}
   store.setSetting(`callback:${run.id}`,JSON.stringify(task));
  });
 }
}
