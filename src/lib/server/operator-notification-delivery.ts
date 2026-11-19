import nodemailer from "nodemailer";
import {notificationSnapshot} from "./operator-notifications";
import type {OutreachStore} from "./outreach/store";
import {hash} from "./outreach/store";
import {notificationsQuiet} from "@/lib/notification-contract";
export async function deliverOperatorNotifications(store:OutreachStore,now=Date.now(),send?:(message:{to:string;subject:string;text:string;messageId:string})=>Promise<void>){
 const snapshot=notificationSnapshot(store),p=snapshot.preferences;
 if(!snapshot.revision||!snapshot.emailReady||notificationsQuiet(p,new Date(now)))return;
 store.db.prepare("UPDATE operator_notification_delivery SET state='uncertain' WHERE state='sending' AND at<?").run(now-120000);
 const pending=store.db.prepare("SELECT e.seq,e.kind FROM events e LEFT JOIN operator_notification_delivery d ON d.id='event:'||e.seq WHERE d.id IS NULL AND e.at>=? AND ((e.kind='reply_received' AND ?=1 AND COALESCE(json_extract(e.data,'$.origin'),'')!='manual_human_operator') OR (e.kind IN ('step_failed','held','escalated') AND ?=1)) ORDER BY e.seq LIMIT 50").all(snapshot.updatedAt,Number(p.comments),Number(p.mentions));
 const candidates=pending.map(row=>({id:"event:"+String(row.seq),subject:row.kind==="reply_received"?"Prospect reply received":"Agent run needs attention",text:"New CTX activity. Open Notifications to review."}));
 if(p.mentions)for(const source of store.sourceList().filter(s=>!s.fixture&&(s.changed||!s.approvedBy)&&s.retrievedAt>=snapshot.updatedAt)){
   candidates.push({id:"source:"+source.id+":"+source.hash,subject:"Review: "+source.title,text:"A source needs review. Open CTX Notifications to review."});
 }
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:p.timeZone,weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(now));
 const part=(type:string)=>parts.find(v=>v.type===type)?.value;
 if(p.weeklyDigest&&part("weekday")==="Mon"&&Number(part("hour"))>=8){
   const count=Number(store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind IN ('reply_received','step_failed','held','escalated') AND at>=?").get(now-7*86400000)?.n??0);
   candidates.push({id:"digest:"+part("year")+"-"+part("month")+"-"+part("day"),subject:"CTX weekly digest",text:count+" recent notifications.\nOpen CTX Notifications to review."});
 }
 for(const item of candidates){
   const claimed=store.db.prepare("INSERT OR IGNORE INTO operator_notification_delivery VALUES (?,'sending',?)").run(item.id,now);
   if(!claimed.changes)continue;
   const message={to:snapshot.emailRecipient,subject:item.subject,text:item.text,messageId:"<ctx-notice-"+hash(item.id).slice(0,32)+"@"+(process.env.GMAIL_USER?.split("@")[1]??"localhost")+">"};
   try{
     if(send)await send(message);
     else{
       const transporter=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD},connectionTimeout:10000,socketTimeout:20000});
       try{const result=await transporter.sendMail({...message,from:process.env.GMAIL_USER});if(!result.accepted?.some(value=>String(value).toLowerCase()===message.to.toLowerCase()))throw new Error("Notification recipient not accepted.");}finally{transporter.close();}
     }
     store.db.prepare("UPDATE operator_notification_delivery SET state='sent',at=? WHERE id=?").run(now,item.id);
   }catch{
     store.db.prepare("UPDATE operator_notification_delivery SET state='uncertain',at=? WHERE id=?").run(now,item.id);
   }
   break;
 }
}
