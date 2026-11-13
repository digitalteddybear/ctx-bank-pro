import { OutreachStore } from "./store";
import type { Run } from "./types";

/** Exact canonical identity and email must both match before any history is retrieved. */
export function contactMemory(store:OutreachStore,run:Run){
  const id=run.prospect.phase1LeadId??run.prospect.id,email=run.prospect.email.toLowerCase();
  return store.list().filter(previous=>previous.id!==run.id&&(previous.prospect.phase1LeadId??previous.prospect.id)===id&&previous.prospect.email.toLowerCase()===email)
    .sort((a,b)=>b.createdAt-a.createdAt).slice(0,5).reverse().map(previous=>({
      runId:previous.id,createdAt:previous.createdAt,status:previous.status,
      messages:previous.transcript.filter(message=>message.direction==="inbound"||message.deliveryStatus==="sent").slice(-20)
        .map(message=>({role:message.direction==="inbound"?"prospect":"dylan",text:message.text,sentAt:message.sentAt})),
      callback:previous.callback,booking:previous.booking,
    }));
}
