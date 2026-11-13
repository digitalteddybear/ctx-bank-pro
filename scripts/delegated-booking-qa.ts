import {test} from "node:test";
import assert from "node:assert/strict";
import {OutreachStore} from "../src/lib/server/outreach/store";
import {arrangeBooking} from "../src/lib/server/outreach/delegated-booking";
import type {Run} from "../src/lib/server/outreach/types";
test("delegated booking uses calendar slots, respects afternoon and never creates twice",async()=>{
 const store=new OutreachStore(":memory:");const original=globalThis.fetch;const key=process.env.CAL_API_KEY;const event=process.env.CAL_EVENT_TYPE_ID;
 process.env.CAL_API_KEY="test";process.env.CAL_EVENT_TYPE_ID="123";
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10);const morning=`${date}T08:00:00Z`;const afternoon=`${date}T14:00:00Z`;let creates=0;
 const run={id:"test-run",prospect:{id:"lead-test",name:"Alex",email:"alex@example.test",facts:[],permission:"granted",dossier:"Test record",jurisdiction:"UK",subscriberType:"individual",lawfulBasis:"consent",pecrCondition:"consent"},synthetic:false,sandbox:true,inference:"fixture",mode:"automatic",revision:0,status:"running",next:"outreach",intent:"reply",corrections:0,draftCounter:0,followups:0,createdAt:Date.now(),campaign:"relationship-reactivation",transcript:[{direction:"inbound",text:"Could you book the call for me? Anytime in the afternoon UK time.",eventId:"reply-1",origin:"inbound_prospect"}]} as Run;
 store.save(run);
 globalThis.fetch=async(input,init)=>{const url=String(input);let data:unknown;
 if(url.endsWith("/calendars"))data={connectedCalendars:[{integration:{type:"google_calendar"},calendars:[{isSelected:true,externalId:"host@example.test"}]}],destinationCalendar:{integration:"google_calendar",externalId:"host@example.test"}};
 else if(url.includes("/slots?"))data={[date]:[{start:morning},{start:afternoon}]};
 else{creates++;const body=JSON.parse(String(init?.body));assert.equal(body.start,new Date(afternoon).toISOString());assert.equal(body.attendee.email,run.prospect.email);assert.equal(body.allowConflicts,undefined);data={id:456,uid:"verified",status:"accepted",start:afternoon,attendees:[{email:run.prospect.email}]};}
 return Response.json({status:"success",data});};
 try{const result=await arrangeBooking(store,run,"https://cal.com/test?user_id=test-reference");assert.match(result!,/I’ve booked/);assert.equal(await arrangeBooking(store,run,"https://cal.com/test"),result);assert.equal(creates,1);}finally{globalThis.fetch=original;store.close();if(key===undefined)delete process.env.CAL_API_KEY;else process.env.CAL_API_KEY=key;if(event===undefined)delete process.env.CAL_EVENT_TYPE_ID;else process.env.CAL_EVENT_TYPE_ID=event;}
});
