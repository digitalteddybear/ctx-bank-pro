import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {OutreachStore} from "../src/lib/server/outreach/store";
import {notificationSnapshot,saveNotificationPreferences,markNotificationRead,NotificationConflict} from "../src/lib/server/operator-notifications";
import {deliverOperatorNotifications} from "../src/lib/server/operator-notification-delivery";
import {DEFAULT_NOTIFICATION_PREFERENCES as defaults,notificationPreferencesSchema,notificationsQuiet} from "../src/lib/notification-contract";
import {approveSource,importSource} from "../src/lib/server/outreach/sources";
process.env.CTX_ADMIN_EMAIL="operator@example.org";delete process.env.CTX_ADMIN_EMAIL_FILE;
process.env.CTX_LIVE_EMAIL_DISPATCH="true";
process.env.GMAIL_USER="sender@example.org";process.env.GMAIL_APP_PASSWORD="fake-test-only";
const source={id:"test-source",url:"https://www.aspinvest.co.uk/privacy-policy",title:"Policy",jurisdiction:"UK",kind:"asp-policy",text:"A verified source passage for testing versioned review."};
test("preferences, read state and current source versions survive database reopen",()=>{
 const directory=mkdtempSync(join(tmpdir(),"ctx-notices-")),file=join(directory,"workflows.sqlite");
 const store=new OutreachStore(file);
 try{
   const first=notificationSnapshot(store);assert.equal(first.preferences.mentions,false);
   saveNotificationPreferences(store,{preferences:{...defaults,comments:true},revision:0});
   assert.throws(()=>saveNotificationPreferences(store,{preferences:defaults,revision:0}),NotificationConflict);
   store.event("run","reply_received",{origin:"inbound_prospect"});
   store.event("run","reply_received",{origin:"manual_human_operator"});
   const policy=importSource(store,source);
   const items=notificationSnapshot(store).items;
   assert.equal(items.length,2);
   markNotificationRead(store,items.find(item=>item.kind==="reply")!.id);
   const revised=importSource(store,{...source,text:source.text+" Updated."});
   assert.throws(()=>approveSource(store,policy.id,policy.hash,"operator"),/changed/);
   assert.equal(notificationSnapshot(store).items.filter(item=>item.id.startsWith("source:")).length,1);
   approveSource(store,revised.id,revised.hash,"operator");
   assert.equal(notificationSnapshot(store).items.filter(item=>item.kind==="review").length,0);
   const reopened=new OutreachStore(file);
   try{assert.equal(notificationSnapshot(reopened).items[0].read,true);assert.equal(notificationSnapshot(reopened).preferences.comments,true);}finally{reopened.db.close();}
 }finally{store.db.close();rmSync(directory,{recursive:true,force:true});}
});
test("quiet hours respect London DST, custom ranges and invalid input",()=>{
 const prefs={...defaults,quietHours:"22-08" as const};
 assert.equal(notificationsQuiet(prefs,new Date("2026-07-01T21:30:00Z")),true);
 assert.equal(notificationsQuiet(prefs,new Date("2026-01-01T21:30:00Z")),false);
 assert.equal(notificationsQuiet({...prefs,quietHours:"custom",quietStart:"13:00",quietEnd:"15:00"},new Date("2026-07-01T13:00:00Z")),true);
 assert.equal(notificationPreferencesSchema.safeParse({...prefs,timeZone:"invalid"}).success,false);
 assert.equal(notificationPreferencesSchema.safeParse({...prefs,quietStart:"25:00"}).success,false);
});
test("opt-in delivery is deduplicated across simultaneous workers and uncertain sends do not repeat",async()=>{
 const store=new OutreachStore(":memory:");
 let calls=0;const send=async(message:{to:string})=>{assert.equal(message.to,"operator@example.org");calls++;};
 try{
   store.event("run","reply_received",{});
   await deliverOperatorNotifications(store,Date.now(),send);assert.equal(calls,0);
   saveNotificationPreferences(store,{preferences:{...defaults,comments:true},revision:0});
   store.event("run","reply_received",{});
   await Promise.all([deliverOperatorNotifications(store,Date.now(),send),deliverOperatorNotifications(store,Date.now(),send)]);
   // Earlier event can share the millisecond of opt-in, so count distinct claimed events.
   const sent=Number(store.db.prepare("SELECT COUNT(*) AS n FROM operator_notification_delivery WHERE state='sent'").get()?.n);
   assert.equal(calls,sent);assert.ok(calls>=1);
   await deliverOperatorNotifications(store,Date.now(),send);
   const before=calls;
   store.event("run","reply_received",{});
   await deliverOperatorNotifications(store,Date.now(),async()=>{calls++;throw new Error("connection lost");});
   assert.equal(notificationSnapshot(store).deliveryIssues,1);
   await deliverOperatorNotifications(store,Date.now(),send);
   assert.equal(calls,before+1);
 }finally{store.db.close();}
});
test("quiet-hour backlog and weekly digest deliver only after the window and once per week",async()=>{
 const store=new OutreachStore(":memory:");let calls=0;
 const now=Date.parse("2026-11-16T07:00:00Z");
 try{
   saveNotificationPreferences(store,{preferences:{...defaults,comments:true,weeklyDigest:true,quietHours:"22-08"},revision:0});
   const raw=JSON.parse(String(store.setting("operator-notifications")));raw.updatedAt=now-1;store.setSetting("operator-notifications",JSON.stringify(raw));
   store.event("run","reply_received",{});store.db.prepare("UPDATE events SET at=?").run(now);
   await deliverOperatorNotifications(store,now,async()=>{calls++;});assert.equal(calls,0);
   await deliverOperatorNotifications(store,now+3600000,async()=>{calls++;});assert.equal(calls,1);
   await deliverOperatorNotifications(store,now+3600001,async()=>{calls++;});assert.equal(calls,2);
   await deliverOperatorNotifications(store,now+7200000,async()=>{calls++;});assert.equal(calls,2);
 }finally{store.db.close();}
});
test("delivery catches up beyond the recent feed and honors the master delivery switch",async()=>{
 const store=new OutreachStore(":memory:");let calls=0;
 try{
   saveNotificationPreferences(store,{preferences:{...defaults,comments:true},revision:0});
   for(let i=0;i<205;i++)store.event("run-"+i,"reply_received",{});
   assert.equal(notificationSnapshot(store).items.length,200);
   process.env.CTX_LIVE_EMAIL_DISPATCH="false";
   await deliverOperatorNotifications(store,Date.now(),async()=>{calls++;});assert.equal(calls,0);
   process.env.CTX_LIVE_EMAIL_DISPATCH="true";
   await deliverOperatorNotifications(store,Date.now(),async()=>{calls++;});
   assert.equal(calls,1);
   assert.equal(store.db.prepare("SELECT state FROM operator_notification_delivery WHERE id='event:1'").get()?.state,"sent");
 }finally{store.db.close();process.env.CTX_LIVE_EMAIL_DISPATCH="true";}
});
