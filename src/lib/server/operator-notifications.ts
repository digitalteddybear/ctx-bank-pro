import {z} from "zod";
import {adminEmail} from "./ctx-profile-store";
import type {OutreachStore} from "./outreach/store";
import {DEFAULT_NOTIFICATION_PREFERENCES,notificationPreferencesSchema} from "@/lib/notification-contract";
const configSchema=z.object({preferences:notificationPreferencesSchema,revision:z.number(),updatedAt:z.number()});
export class NotificationConflict extends Error {}
export function initNotifications(store:OutreachStore){
 store.db.exec("CREATE TABLE IF NOT EXISTS operator_notification_reads(id TEXT PRIMARY KEY,at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS operator_notification_delivery(id TEXT PRIMARY KEY,state TEXT NOT NULL,at INTEGER NOT NULL);");
}
function config(store:OutreachStore){
 const raw=store.setting("operator-notifications");
 return raw?configSchema.parse(JSON.parse(String(raw))):{preferences:DEFAULT_NOTIFICATION_PREFERENCES,revision:0,updatedAt:0};
}
export function notificationSnapshot(store:OutreachStore){
 initNotifications(store);
 const read=new Set(store.db.prepare("SELECT id FROM operator_notification_reads").all().map(row=>String(row.id)));
 const rows=store.db.prepare("SELECT seq,kind,at,data FROM events WHERE kind IN ('reply_received','step_failed','held','escalated') ORDER BY seq DESC LIMIT 200").all();
 const items=rows.flatMap(row=>{
   const data:unknown=JSON.parse(String(row.data));
   if(row.kind==="reply_received"&&data&&typeof data==="object"&&"origin"in data&&data.origin==="manual_human_operator")return [];
   const id="event:"+String(row.seq);
   return [{id,kind:row.kind==="reply_received"?"reply" as const:"review" as const,title:row.kind==="reply_received"?"Prospect reply received":"Agent run needs attention",at:Number(row.at),read:read.has(id)}];
 });
 for(const source of store.sourceList().filter(s=>!s.fixture&&(s.changed||!s.approvedBy))){
   const id="source:"+source.id+":"+source.hash;
   items.push({id,kind:"review",title:"Review: "+source.title,at:source.retrievedAt,read:read.has(id)});
 }
 const recipient=adminEmail();
 return {...config(store),items:items.sort((a,b)=>b.at-a.at).slice(0,200),emailRecipient:recipient,
 emailReady:Boolean(recipient&&process.env.GMAIL_USER&&process.env.GMAIL_APP_PASSWORD&&process.env.CTX_LIVE_EMAIL_DISPATCH==="true"),
 deliveryIssues:Number(store.db.prepare("SELECT COUNT(*) AS n FROM operator_notification_delivery WHERE state IN ('uncertain','failed')").get()?.n??0)};
}
export function saveNotificationPreferences(store:OutreachStore,raw:unknown){
 const input=z.object({preferences:notificationPreferencesSchema,revision:z.number().int().nonnegative()}).strict().parse(raw);
 return store.transaction(()=>{
   const current=config(store);
   if(input.revision!==current.revision)throw new NotificationConflict("Notifications changed in another session. Reload before saving.");
   const updatedAt=current.updatedAt||Date.now();
   store.setSetting("operator-notifications",JSON.stringify({preferences:input.preferences,revision:current.revision+1,updatedAt}));
   return notificationSnapshot(store);
 });
}
export function markNotificationRead(store:OutreachStore,id:string){
 const snapshot=notificationSnapshot(store);
 if(!snapshot.items.some(item=>item.id===id))throw new Error("Notification not found.");
 store.db.prepare("INSERT OR IGNORE INTO operator_notification_reads VALUES (?,?)").run(id,Date.now());
}
