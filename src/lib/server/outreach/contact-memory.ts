import { OutreachStore } from "./store";
import type { Run } from "./types";

/** Exact canonical identity and email must both match before any history is retrieved. */
export function contactMemory(store:OutreachStore,run:Run){
  const id=run.prospect.phase1LeadId??run.prospect.id;
  const previousRuns=store.db.prepare(`
    SELECT data FROM runs WHERE
      coalesce(json_extract(data,'$.prospect.phase1LeadId'),json_extract(data,'$.prospect.id'))=?
      AND lower(trim(json_extract(data,'$.prospect.email')))=?
      AND id<>? AND coalesce(json_extract(data,'$.sandbox'),0)=?
      AND coalesce(json_extract(data,'$.synthetic'),0)=?
      AND (json_extract(data,'$.campaignId') IS NOT NULL)=?
    ORDER BY json_extract(data,'$.createdAt') DESC, rowid DESC LIMIT 5
  `).all(id,run.prospect.email.trim().toLowerCase(),run.id,Number(Boolean(run.sandbox)),
    Number(Boolean(run.synthetic)),Number(Boolean(run.campaignId)));
  return previousRuns.reverse().map(row=>JSON.parse(String(row.data)) as Run).map(previous=>({
      runId:previous.id,createdAt:previous.createdAt,status:previous.status,
      messages:previous.transcript.filter(message=>message.direction==="inbound"||message.deliveryStatus==="sent").slice(-20)
        .map(message=>({role:message.direction==="inbound"?"prospect":"dylan",text:message.text,sentAt:message.sentAt})),
      callback:previous.callback,booking:previous.booking,
    }));
}
