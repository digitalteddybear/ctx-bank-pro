import { z } from "zod";
import { hash, OutreachStore } from "./store";
import type { Run } from "./types";
import { bookingResult } from "./delegated-booking";
import { queueCrmJob } from "./production-delivery";

const booking=z.object({id:z.number(),uid:z.string(),start:z.string().datetime({offset:true}),status:z.string(),attendees:z.array(z.object({email:z.string()})),metadata:z.record(z.string(),z.unknown()).optional()}).passthrough();
export async function reconcileCalRun(store:OutreachStore,run:Run){
  if(run.synthetic||run.booking?.status==="confirmed"||!process.env.CAL_API_KEY||!process.env.CAL_EVENT_TYPE_ID)return;
  if(!run.transcript.some(turn=>turn.deliveryStatus==="sent"))return;
  const known=bookingResult(store,run.id);
  const query=new URLSearchParams({attendeeEmail:run.prospect.email,eventTypeId:process.env.CAL_EVENT_TYPE_ID,status:"upcoming",limit:"100",afterCreatedAt:new Date(run.createdAt).toISOString()});
  const response=await fetch("https://api.cal.com/v2/bookings"+(known?.uid?"/"+encodeURIComponent(known.uid):"?"+query),{headers:{Authorization:"Bearer "+process.env.CAL_API_KEY,"cal-api-version":"2026-05-01"},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error("Cal booking lookup failed: HTTP "+response.status);
  const wire:unknown=await response.json();
  const candidates=known?.uid?[z.object({data:booking}).parse(wire).data]:z.object({data:z.array(booking)}).parse(wire).data;
  for(const candidate of candidates){
    if(candidate.status.toLowerCase()!=="accepted"||!candidate.attendees.some(attendee=>attendee.email.toLowerCase()===run.prospect.email.toLowerCase()))continue;
    let linked=known?.uid===candidate.uid;
    if(typeof candidate.metadata?.user_id==="string"){
      const ref=store.db.prepare("SELECT run_id FROM booking_references WHERE ref_hash=?").get(hash(candidate.metadata.user_id));
      linked=ref?.run_id===run.id;
    }
    if(candidate.metadata?.ctx_run_id===run.id)linked=true;
    if(!linked)continue;
    const {OutreachEngine}=await import("./engine"),{FixtureModel,ConfigurableModel}=await import("./models");
    new OutreachEngine(store,run.inference==="live"?new ConfigurableModel():new FixtureModel()).booking(run.id,{eventId:"cal-api-"+candidate.uid,bookingId:String(candidate.id),sequence:1,startsAt:candidate.start,status:"confirmed"});
    const hubspotId=(run.prospect.phase1LeadId??run.prospect.id).replace(/^lead-/,"");
    queueCrmJob(store,"cal-api-"+candidate.uid+":status",run.id,"status",{hubspotId,email:run.prospect.email,messageId:"cal-api-"+candidate.uid+":status",approvedBy:"cal-api-reconciliation",properties:{ctx_status:"Booked",ctx_last_contact:new Date().toISOString(),ctx_booking_link_sent:true}});
    queueCrmJob(store,"cal-api-"+candidate.uid+":briefing",run.id,"briefing",{hubspotId,email:run.prospect.email,messageId:"cal-api-"+candidate.uid+":briefing",stage:"Call booked",prospectQuote:"Booking confirmed for "+candidate.start,agentBrief:"Cal.com confirmed the booking through its API. Google Calendar remains the meeting record.",talkingPoints:["Confirm the stated objective.","Address unresolved prospect questions.","Use verified contact context."]});
    store.event(run.id,"cal_api_reconciled",{uid:candidate.uid,start:candidate.start});
    return;
  }
}
export async function reconcilePendingBookings(store:OutreachStore){
  if(!process.env.CAL_API_KEY)return;
  for(const run of store.list().filter(run=>run.status==="booking_pending").slice(0,20)){
    const key="cal-api-checked:"+run.id;
    if(Date.now()-Number(store.setting(key)??0)<60000)continue;
    store.setSetting(key,String(Date.now()));
    try{await reconcileCalRun(store,run);}catch(error){store.event(run.id,"cal_api_check_failed",{message:error instanceof Error?error.message:"Calendar unavailable."});}
  }
}
