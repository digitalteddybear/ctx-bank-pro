import { z } from "zod";
import type { OutreachStore } from "./store";
import type { Run } from "./types";
export const delegatedRequest = (text:string) => /(?:book|schedule|arrange).*(?:for me|on my behalf)|(?:can|could|would) you (?:please )?book/i.test(text) && !/do not|don't|no calls/i.test(text);
const resultSchema=z.object({status:z.enum(["confirmed","pending","uncertain"]),message:z.string(),id:z.string().optional(),uid:z.string().optional(),start:z.string().optional()});
export function bookingResult(store:OutreachStore,id:string){const raw=store.setting(`cal-booking:${id}`);return raw?resultSchema.parse(JSON.parse(String(raw))):undefined;}
async function api(path:string,init:RequestInit={}){const r=await fetch(`https://api.cal.com/v2${path}`,{...init,redirect:"error",signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${process.env.CAL_API_KEY}`,"Content-Type":"application/json","cal-api-version":path.startsWith("/slots")?"2024-09-04":"2026-02-25"}});if(!r.ok)throw new Error(`Cal API HTTP ${r.status}`);return r.json() as Promise<unknown>;}
export async function arrangeBooking(store:OutreachStore,run:Run,link:string):Promise<string|undefined>{
 const inbound=run.transcript.filter(t=>t.direction==="inbound").at(-1);if(!inbound)return;
 const assessment=z.object({sourceEventId:z.string().optional(),scheduling:z.object({delegated:z.boolean(),quote:z.string(),timeZone:z.string(),after:z.string().datetime({offset:true}).nullable(),before:z.string().datetime({offset:true}).nullable(),localStartMinute:z.number().int().min(0).max(1439),localEndMinute:z.number().int().min(1).max(1440)}).optional()}).safeParse(JSON.parse(String(store.setting("assessment:"+run.id)??"{}")));
 const proposed=assessment.success&&assessment.data.sourceEventId===inbound.eventId?assessment.data.scheduling:undefined;
 const semantic=proposed?.delegated&&proposed.quote.trim()&&inbound.text.includes(proposed.quote)?proposed:undefined;
 if(!delegatedRequest(inbound.text)&&!semantic)return;
 const old=bookingResult(store,run.id);if(old)return old.message;
 if(run.synthetic||inbound.origin!=="inbound_prospect")return "I haven’t created a booking: this is a simulated conversation.";
 if(!process.env.CAL_API_KEY||!process.env.CAL_EVENT_TYPE_ID)return "I can help arrange the call, but the calendar connection needs attention before I can confirm a time.";
 const text=inbound.text;
 // Ambiguous or unsupported dates are clarified instead of silently discarded.
 const weekday=text.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)?.[0].toLowerCase();
 if(!semantic&&/\d{1,2}[:/]\d{2}|\b(?:at|after|before|between) \d|\b(?:am|pm|EST|PST|CET)\b|next week|next month/i.test(text))return "Which date and time zone should I use for the call? Please include your preferred time window so I can check the calendar accurately.";
 if(!semantic&&!/morning|afternoon|anytime|any time|tomorrow|today/i.test(text)&&!weekday)return "Of course. Which day and time window would suit you, and in which time zone?";
 const now=Date.now();
 let timeZone="Europe/London";
 if(semantic){
   if(!semantic.after||!semantic.before||new Date(semantic.before).getTime()<=new Date(semantic.after).getTime()||new Date(semantic.after).getTime()>now+31*86400000||semantic.localEndMinute<=semantic.localStartMinute)return "Which date and time window should I use, and in which time zone?";
   try{new Intl.DateTimeFormat("en-GB",{timeZone:semantic.timeZone}).format();timeZone=semantic.timeZone;}catch{return "Which time zone should I use for the call?";}
 }
 const fmt=(d:Date,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat("en-GB",{timeZone,...options}).format(d);
 const desiredDay=/tomorrow/i.test(text)?fmt(new Date(now+86400000),{dateStyle:"short"}):/today/i.test(text)?fmt(new Date(now),{dateStyle:"short"}):undefined;
 try {
 const calendars=z.object({data:z.object({connectedCalendars:z.array(z.object({integration:z.object({type:z.string()}),calendars:z.array(z.object({isSelected:z.boolean(),externalId:z.string()}))})),destinationCalendar:z.object({integration:z.string(),externalId:z.string()})})}).parse(await api("/calendars"));
 const destination=calendars.data.destinationCalendar;
 if(destination.integration!=="google_calendar"||!calendars.data.connectedCalendars.some(c=>c.integration.type==="google_calendar"&&c.calendars.some(x=>x.isSelected&&x.externalId===destination.externalId)))throw new Error("Google Calendar conflict checking is not configured");
 const query=new URLSearchParams({eventTypeId:process.env.CAL_EVENT_TYPE_ID,start:new Date(semantic?.after?Math.max(now,new Date(semantic.after).getTime()):now).toISOString(),end:new Date(semantic?.before?Math.min(now+31*86400000,new Date(semantic.before).getTime()):now+14*86400000).toISOString(),timeZone});
 const slots=z.object({data:z.record(z.string(),z.array(z.object({start:z.string().datetime({offset:true})})))}).parse(await api(`/slots?${query}`));
 const selected=Object.values(slots.data).flat().map(s=>new Date(s.start)).filter(d=>{const h=Number(fmt(d,{hour:"numeric",hourCycle:"h23"}));if(semantic){const minute=Number(fmt(d,{hour:"numeric",hourCycle:"h23"}))*60+Number(fmt(d,{minute:"numeric"}));return d.getTime()>now+30*60000&&d.getTime()>=new Date(semantic.after!).getTime()&&d.getTime()<new Date(semantic.before!).getTime()&&minute>=semantic.localStartMinute&&minute<semantic.localEndMinute;}return d.getTime()>now+30*60000&&(!desiredDay||fmt(d,{dateStyle:"short"})===desiredDay)&&(!weekday||fmt(d,{weekday:"long"}).toLowerCase()===weekday)&&(!/afternoon/i.test(text)||(h>=12&&h<17))&&(!/morning/i.test(text)||(h>=9&&h<12));}).sort((a,b)=>a.getTime()-b.getTime())[0];
 if(!selected)return "There isn’t a free slot matching that date and time preference. Would another day or time window work for you?";
 const claimed=store.transaction(()=>{const current=store.get(run.id);if(bookingResult(store,run.id)||current.revision!==run.revision||current.humanManaged||store.isSuppressed(current.prospect.email))return false;store.setSetting(`cal-booking:${run.id}`,JSON.stringify({status:"uncertain",message:"I’m checking the booking result before confirming it. I won’t create a second appointment."}));return true;});
 if(!claimed)return bookingResult(store,run.id)?.message;
 const wire=z.object({data:z.object({id:z.number(),uid:z.string(),status:z.string(),start:z.string().datetime({offset:true}),attendees:z.array(z.object({email:z.string()}))})}).parse(await api("/bookings",{method:"POST",body:JSON.stringify({eventTypeId:Number(process.env.CAL_EVENT_TYPE_ID),start:selected.toISOString(),attendee:{name:run.prospect.name,email:run.prospect.email,timeZone,language:"en"},metadata:{user_id:new URL(link).searchParams.get("user_id"),ctx_run_id:run.id}})}));
 const b=wire.data;if(!b.attendees.some(a=>a.email.toLowerCase()===run.prospect.email.toLowerCase())||new Date(b.start).getTime()!==selected.getTime())throw new Error("Booking response identity mismatch");
 const confirmed=b.status.toLowerCase()==="accepted";
 const result={status:confirmed?"confirmed":"pending",id:String(b.id),uid:b.uid,start:b.start,message:confirmed?`I’ve booked your introductory call for ${fmt(selected,{dateStyle:"full",timeStyle:"short"})} ${timeZone} time. Cal.com will send the calendar invitation to this email address.`:"Your booking request has been submitted and is awaiting confirmation. I’ll confirm once the calendar accepts it."};
 store.setSetting(`cal-booking:${run.id}`,JSON.stringify(result));store.event(run.id,"cal_delegated_booking",{...result,sourceEventId:inbound.eventId});return result.message;
 }catch(error){store.event(run.id,"cal_booking_error",{message:error instanceof Error?error.message:"Calendar unavailable"});return bookingResult(store,run.id)?.message??"I couldn’t confirm availability just now. The call is not booked; the calendar needs another check.";}
}
