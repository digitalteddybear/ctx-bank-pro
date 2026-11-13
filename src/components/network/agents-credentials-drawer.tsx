"use client";
import {useEffect,useState} from 'react';
import {z} from 'zod';
import {Dialog,DialogHeader} from '@astryxdesign/core/Dialog';
import {VStack,HStack} from '@astryxdesign/core/Layout';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Switch} from '@astryxdesign/core/Switch';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {requestBackendSync} from '@/lib/backend-sync';
const statusSchema=z.object({senderName:z.string(),email:z.string(),liveDelivery:z.boolean(),hasPassword:z.boolean()});
const checksSchema=z.object({smtp:z.boolean(),imap:z.boolean()});
export function AgentsCredentialsDrawer({isOpen,onOpenChange}:{isOpen:boolean;onOpenChange:(open:boolean)=>void}){
  const [name,setName]=useState('Dylan (ASP Private Capital)'),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [live,setLive]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[message,setMessage]=useState('');
  const [checks,setChecks]=useState<z.infer<typeof checksSchema>>();
  useEffect(()=>{let active=true;setPassword('');setChecks(undefined);setMessage('');setLoaded(false);if(isOpen)void fetch('/api/agents/credentials',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Could not load sender settings.');return statusSchema.parse(await r.json());}).then(s=>{if(active){setName(s.senderName);setEmail(s.email);setLive(s.liveDelivery);setLoaded(true);}}).catch(()=>{if(active)setMessage('Could not load sender settings.');});return()=>{active=false;};},[isOpen]);
  const act=async(save:boolean)=>{setBusy(true);setMessage('');try{const credentials={senderName:name,email,password};const r=await fetch(save?'/api/agents/credentials':'/api/agents/credentials/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(save?{credentials,liveDelivery:live}:credentials)});const value:unknown=await r.json();const result=checksSchema.safeParse(value);if(result.success)setChecks(result.data);if(!r.ok){const error=z.object({error:z.string()}).safeParse(value);throw new Error(error.success?error.data.error:'Connection failed.');}if(save){setPassword('');setMessage('Saved. Restart separately running workers to load the new settings.');requestBackendSync();}}catch(e){setMessage(e instanceof Error?e.message:'Sender request failed.');}finally{setBusy(false);}};
  const changed=()=>setChecks(undefined);
  return <Dialog isOpen={isOpen} onOpenChange={open=>{if(!busy)onOpenChange(open);}} purpose="form" width="min(95vw, 32rem)"><DialogHeader title="Sender Config" onOpenChange={open=>{if(!busy)onOpenChange(open);}}/><VStack padding={4} gap={3}>
    <TextInput label="Sender Name" size="sm" value={name} isDisabled={busy||!loaded} onChange={v=>{setName(v);changed();}}/>
    <TextInput label="Sender Email" type="email" size="sm" value={email} isDisabled={busy||!loaded} onChange={v=>{setEmail(v);changed();}}/>
    <TextInput label="App Password" type="password" size="sm" value={password} isDisabled={busy||!loaded} onChange={v=>{setPassword(v);changed();}} description="Enter the 16-character Google App Password to test or save. Stored passwords are never displayed."/>
    <Switch label="Live Delivery" value={live} isDisabled={busy||!loaded} onChange={setLive} description="Save applies this setting. Campaign permission checks still apply."/>
    {checks&&<VStack gap={1}><Text role="status">SMTP {checks.smtp?'Connected':'Failed'}</Text><Text role="status">IMAP {checks.imap?'Reachable':'Failed'}</Text></VStack>}
    {message&&<Text role="status">{message}</Text>}
    <HStack gap={2} wrap="wrap"><Button label="Test Connection" size="sm" isDisabled={busy||!loaded||!password} onClick={()=>void act(false)}/><Button label="Save" size="sm" variant="primary" isLoading={busy} isDisabled={!loaded||!password||!checks?.smtp||!checks?.imap} onClick={()=>void act(true)}/></HStack>
  </VStack></Dialog>;
}
