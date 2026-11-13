"use client";
import { useRef, useState } from "react";
import { z } from "zod";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { requestBackendSync, useBackendRefresh } from "@/lib/backend-sync";

const row=z.object({id:z.string(),run_id:z.string(),state:z.string(),error:z.string().nullable()});
const operations=z.object({heartbeat:z.number(),deliveries:z.array(row),crm:z.array(row.extend({kind:z.string(),attempts:z.number()})),sources:z.array(z.object({id:z.string(),title:z.string(),ready:z.boolean(),checkedAt:z.number()}))});
const sourceSchema=z.object({id:z.string(),title:z.string(),url:z.string(),text:z.string(),hash:z.string(),approvedBy:z.string().optional(),changed:z.boolean(),fixture:z.boolean()});
export function OutreachOperationsPanel(){
  const [hubspotWrites,setHubspotWrites]=useState(false),[calEventTypeId,setCalEventTypeId]=useState("");
  const integrationDirty=useRef(false);
  const [data,setData]=useState<z.infer<typeof operations>>();
  const [expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const [retryable,setRetryable]=useState<Set<string>>(new Set());
  const [sourcesOpen,setSourcesOpen]=useState(false),[sources,setSources]=useState<z.infer<typeof sourceSchema>[]>([]),[selected,setSelected]=useState<string>();
  const refresh=async()=>{try{const response=await fetch("/api/agents/operations",{cache:"no-store"});if(!response.ok)throw new Error("Operations status unavailable.");setData(operations.parse(await response.json()));if(!integrationDirty.current){const r=await fetch("/api/agents/integrations",{cache:"no-store"});if(r.ok){const settings=z.object({hubspotWrites:z.boolean(),calEventTypeId:z.string()}).parse(await r.json());setHubspotWrites(settings.hubspotWrites);setCalEventTypeId(settings.calEventTypeId);}}}catch(error){setNotice(error instanceof Error?error.message:"Status unavailable.");}};
  useBackendRefresh(async()=>{await refresh();if(sourcesOpen)await showSources();});
  const action=async(command:Record<string,unknown>)=>{
    setBusy(true);setNotice("");
    try{
      const response=await fetch("/api/agents",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(command)});
      const result:unknown=await response.json();
      if(!response.ok)throw new Error(result&&typeof result==="object"&&"error"in result?String(result.error):"Action failed.");
      if(command.action==="check-delivery"&&result&&typeof result==="object"&&"found"in result&&!result.found){
        setRetryable(previous=>new Set(previous).add(String(command.id)));setNotice("Message not found in Sent mail. Confirm it was not sent before choosing Retry.");
      }else setNotice("Updated.");
      requestBackendSync();await refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Action failed.");}finally{setBusy(false);}
  };
  const showSources=async()=>{
    setSourcesOpen(true);
    try{const response=await fetch("/api/agents/sources",{cache:"no-store"});if(!response.ok)throw new Error("Sources unavailable.");setSources(z.array(sourceSchema).parse(await response.json()));}catch(error){setNotice(error instanceof Error?error.message:"Sources unavailable.");}
  };
  const source=sources.find(item=>item.id===selected);
  const pending=(data?.deliveries.length??0)+(data?.crm.length??0);
  return <Card padding={4}><VStack gap={3}>
    <HStack gap={2} hAlign="between" wrap="wrap"><Text type="label">Operations</Text><HStack gap={2}><Text type="supporting">{data?.heartbeat&&Date.now()-data.heartbeat<120000?"Worker online":"Worker unavailable"} · {pending} pending</Text><Button label={expanded?"Close":"View"} size="sm" onClick={()=>setExpanded(!expanded)}/><Button label="Sources" size="sm" onClick={()=>void showSources()}/></HStack></HStack>
    {notice&&<Text role="status">{notice}</Text>}
    {expanded&&<VStack gap={3}>
      <Text type="label">Integrations</Text>
      <Switch label="HubSpot writes" value={hubspotWrites} onChange={value=>{integrationDirty.current=true;setHubspotWrites(value);}}/>
      <TextInput label="Cal.com event ID" size="sm" value={calEventTypeId} onChange={value=>{integrationDirty.current=true;setCalEventTypeId(value);}}/>
      <Button label="Save" size="sm" variant="primary" className="button button--primary button--sm" isDisabled={busy} onClick={async()=>{setBusy(true);try{const r=await fetch("/api/agents/integrations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({hubspotWrites,calEventTypeId})});const data:unknown=await r.json();if(!r.ok)throw new Error(data&&typeof data==="object"&&"error"in data?String(data.error):"Settings were not saved.");integrationDirty.current=false;setNotice("Integration settings saved.");requestBackendSync();}catch(error){setNotice(error instanceof Error?error.message:"Save failed.");}finally{setBusy(false);}}}/>

      <Text type="label">Delivery</Text>
      {!data?.deliveries.length&&<Text type="supporting">No pending deliveries.</Text>}
      {data?.deliveries.map(item=><HStack key={item.id} gap={2} wrap="wrap" hAlign="between"><VStack gap={1}><Text>{item.run_id} · {item.state}</Text>{item.error&&<Text type="supporting">{item.error}</Text>}</VStack>{item.state==="uncertain"&&<HStack gap={2}><Button label="Check" size="sm" isDisabled={busy} onClick={()=>void action({action:"check-delivery",id:item.id})}/>{retryable.has(item.id)&&<Button label="Retry" size="sm" isDisabled={busy} onClick={()=>void action({action:"retry-delivery",id:item.id,confirmUnsent:true})}/>}</HStack>}</HStack>)}
      <Text type="label">HubSpot</Text>
      {!data?.crm.length&&<Text type="supporting">No pending CRM updates.</Text>}
      {data?.crm.map(item=><HStack key={item.id} gap={2} wrap="wrap" hAlign="between"><VStack gap={1}><Text>{item.kind} · {item.state}</Text>{item.error&&<Text type="supporting">{item.error}</Text>}</VStack>{["failed","uncertain"].includes(item.state)&&<HStack gap={2}><Button label="Retry" size="sm" isDisabled={busy} onClick={()=>void action({action:"resolve-crm",id:item.id,resolution:"retry"})}/><Button label="Confirm synced" size="sm" isDisabled={busy} onClick={()=>void action({action:"resolve-crm",id:item.id,resolution:"applied"})}/></HStack>}</HStack>)}
      <Text type="supporting">For uncertain CRM results, check HubSpot before retrying or confirming sync.</Text>
    </VStack>}
    <Dialog isOpen={sourcesOpen} onOpenChange={setSourcesOpen} width="min(90vw, 48rem)" maxHeight="80vh"><DialogHeader title="Sources" onOpenChange={setSourcesOpen}/><VStack padding={4} gap={3} height="60vh" isScrollable>
      <Button label="Refresh" size="sm" isDisabled={busy} onClick={()=>void action({action:"refresh-sources"})}/>
      {sources.map(item=><HStack key={item.id} gap={2} hAlign="between"><Text>{item.title}</Text><Button label="Review" size="sm" onClick={()=>setSelected(item.id)}/></HStack>)}
      {source&&<VStack gap={3}><Button label="Open source" size="sm" href={source.url}/><TextArea label={source.title} rows={12} value={source.text} onChange={()=>undefined} isDisabled/><Button label="Approve" size="sm" isDisabled={busy||source.fixture} onClick={()=>void action({action:"approve-source",id:source.id,hash:source.hash,reviewer:"dashboard-operator"})}/>{source.fixture&&<Text type="supporting">Simulation source. A current official version must be fetched before approval.</Text>}</VStack>}
    </VStack></Dialog>
  </VStack></Card>;
}
