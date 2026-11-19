"use client";
import {useRef,useState} from "react";
import {z} from "zod";
import {Card} from "@astryxdesign/core/Card";
import {Dialog,DialogHeader} from "@astryxdesign/core/Dialog";
import {VStack,HStack} from "@astryxdesign/core/Stack";
import {Heading,Text} from "@astryxdesign/core/Text";
import {Button} from "@astryxdesign/core/Button";
import {Switch} from "@astryxdesign/core/Switch";
import {Selector} from "@astryxdesign/core/Selector";
import {TextInput} from "@astryxdesign/core/TextInput";
import {TextArea} from "@astryxdesign/core/TextArea";
import {Divider} from "@astryxdesign/core/Divider";
import {Icon} from "@astryxdesign/core/Icon";
import {useToast} from "@astryxdesign/core/Toast";
import {AtSymbolIcon,ChatBubbleLeftRightIcon,EnvelopeIcon,ComputerDesktopIcon,SpeakerWaveIcon,ClockIcon} from "@heroicons/react/24/outline";
import {requestBackendSync,useBackendRefresh} from "@/lib/backend-sync";
import {DEFAULT_NOTIFICATION_PREFERENCES,notificationSnapshotSchema,reviewSourceSchema,type NotificationPreferences} from "@/lib/notification-contract";
import {playNotificationSound} from "@/lib/notification-sound";

export function NotificationSettings(){
 const [prefs,setPrefs]=useState(DEFAULT_NOTIFICATION_PREFERENCES);
 const [snapshot,setSnapshot]=useState<z.infer<typeof notificationSnapshotSchema>>();
 const [sources,setSources]=useState<z.infer<typeof reviewSourceSchema>[]>([]);
 const [selected,setSelected]=useState<z.infer<typeof reviewSourceSchema>|null>(null);
 const [notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const dirty=useRef(false),version=useRef(0),edit=useRef(0),loading=useRef(false);
 const toast=useToast();
 const refresh=async()=>{
   if(loading.current)return;loading.current=true;
   try{
     const [response,sourceResponse]=await Promise.all([fetch("/api/notifications",{cache:"no-store"}),fetch("/api/agents/sources",{cache:"no-store"})]);
     if(!response.ok||!sourceResponse.ok)throw new Error("Could not load notifications.");
     const data=notificationSnapshotSchema.parse(await response.json());
     setSnapshot(data);setSources(z.array(reviewSourceSchema).parse(await sourceResponse.json()));
     if(!dirty.current){setPrefs(data.preferences);version.current=data.revision;}
   }catch(error){setNotice(error instanceof Error?error.message:"Notifications unavailable.");}
   finally{loading.current=false;}
 };
 useBackendRefresh(refresh);
 const change=<K extends keyof NotificationPreferences>(key:K,value:NotificationPreferences[K])=>{
   dirty.current=true;edit.current++;setPrefs(current=>({...current,[key]:value}));setNotice("Unsaved changes.");
 };
 const save=async()=>{
   if(busy||!snapshot)return;setBusy(true);
   const pending=edit.current;
   try{
     const response=await fetch("/api/notifications",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({preferences:prefs,revision:version.current})});
     const raw:unknown=await response.json();
     if(!response.ok)throw new Error(z.object({error:z.string()}).parse(raw).error);
     const data=notificationSnapshotSchema.parse(raw);setSnapshot(data);version.current=data.revision;
     dirty.current=pending!==edit.current;setNotice(dirty.current?"Saved. New edits are unsaved.":"Saved.");
     toast({body:"Notifications saved.",uniqueID:"notifications-save"});requestBackendSync();
   }catch(error){setNotice(error instanceof Error?error.message:"Could not save notifications.");}
   finally{setBusy(false);}
 };
 const approve=async()=>{
   if(!selected||busy)return;setBusy(true);
   try{
     const response=await fetch("/api/agents",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"approve-source",id:selected.id,hash:selected.hash,reviewer:"dashboard-operator"})});
     if(!response.ok){const result=z.object({error:z.string()}).parse(await response.json());throw new Error(result.error);}
     setSelected(null);setNotice("Source approved.");toast({body:"Source approved.",uniqueID:"source-review"});requestBackendSync();await refresh();
   }catch(error){setNotice(error instanceof Error?error.message:"Approval failed.");}
   finally{setBusy(false);}
 };
 const markRead=async(id:string)=>{
   try{const response=await fetch("/api/notifications",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({read:id})});if(!response.ok)throw new Error("Could not mark notification read.");await refresh();requestBackendSync();}
   catch(error){setNotice(error instanceof Error?error.message:"Could not update notification.");}
 };
 return <VStack gap={5}>
   <HStack gap={3} hAlign="between" wrap="wrap"><Text role="status">{notice||"Choose notifications, then save."}</Text><Button label="Save" size="sm" variant="primary" className="button button--primary button--sm" isDisabled={busy||!snapshot} isLoading={busy} onClick={()=>void save()}/></HStack>
   <VStack gap={2}><Heading level={3}>Email</Heading><Text type="supporting" color="secondary">{snapshot?.emailReady?"Sent to "+snapshot.emailRecipient:"Configure sender credentials, an administrator email and live delivery to receive email notifications."}</Text>
    <Card padding={0}><NotificationRow icon={AtSymbolIcon} title="Mentions" description="When a source or agent run needs review." value={prefs.mentions} onChange={v=>change("mentions",v)}/><Divider/>
    <NotificationRow icon={ChatBubbleLeftRightIcon} title="Comments" description="When a prospect replies." value={prefs.comments} onChange={v=>change("comments",v)}/><Divider/>
    <NotificationRow icon={EnvelopeIcon} title="Weekly digest" description="Recent activity, Monday after 8 am in your time zone." value={prefs.weeklyDigest} onChange={v=>change("weeklyDigest",v)}/></Card>
    {!!snapshot?.deliveryIssues&&<Text role="alert">{snapshot.deliveryIssues} notification deliveries need checking. Uncertain sends are not automatically repeated.</Text>}
   </VStack>
   <VStack gap={2}><Heading level={3}>CTX review queue</Heading><Card padding={4}><VStack gap={3}>
    <HStack hAlign="between" gap={2}><Text>Pending source approvals</Text><Button label="Refresh" size="sm" onClick={()=>void refresh()}/></HStack>
    {!sources.some(source=>source.fixture||source.changed||!source.approvedBy)&&<Text color="secondary">No source reviews are pending.</Text>}
    {sources.filter(source=>source.fixture||source.changed||!source.approvedBy).map(source=><HStack key={source.id} gap={3} hAlign="between" wrap="wrap"><Text>{source.title}</Text><Button label="Review" size="sm" onClick={()=>setSelected(source)}/></HStack>)}
   </VStack></Card></VStack>
   <VStack gap={2}><Heading level={3}>Recent activity</Heading>
    {!snapshot?.items.length&&<Text color="secondary">No notifications yet.</Text>}
    {snapshot?.items.slice(0,50).map(item=><HStack key={item.id} gap={3} hAlign="between" wrap="wrap"><VStack gap={1}><Text>{item.title}</Text><Text type="supporting" color="secondary">{new Date(item.at).toLocaleString()}</Text></VStack>{item.read?<Text color="secondary">Read</Text>:<Button label="Mark read" size="sm" onClick={()=>void markRead(item.id)}/>}</HStack>)}
   </VStack>
   <VStack gap={2}><Heading level={3}>Desktop</Heading><Card padding={0}>
    <NotificationRow icon={ComputerDesktopIcon} title="Desktop notifications" description="While CTX is open in a supported browser." value={prefs.desktop} onChange={async value=>{
      if(value){if(!("Notification"in window)){setNotice("Desktop notifications are unavailable in this browser.");return;}
        const permission=await Notification.requestPermission();if(permission!=="granted"){setNotice("Enable notifications in your browser permissions.");return;}}
      change("desktop",value);
    }}/><Divider/>
    <NotificationRow icon={SpeakerWaveIcon} title="Play a sound" description="For new activity after interacting with this browser." value={prefs.sound} onChange={value=>{change("sound",value);if(value)void playNotificationSound();}}/><Divider/>
    <HStack gap={3} hAlign="between" vAlign="center" padding={4} wrap="wrap"><HStack gap={3}><Icon icon={ClockIcon}/><Text>Quiet hours</Text></HStack><Selector label="Quiet hours" isLabelHidden size="sm" value={prefs.quietHours} onChange={value=>change("quietHours",value as NotificationPreferences["quietHours"])} options={[{value:"off",label:"Off"},{value:"22-08",label:"10 pm – 8 am"},{value:"custom",label:"Custom"}]}/></HStack>
    {prefs.quietHours!=="off"&&<VStack gap={3} padding={4}>{prefs.quietHours==="custom"&&<HStack gap={3} wrap="wrap"><TextInput label="Start" placeholder="HH:MM" value={prefs.quietStart} onChange={v=>change("quietStart",v)}/><TextInput label="End" placeholder="HH:MM" value={prefs.quietEnd} onChange={v=>change("quietEnd",v)}/></HStack>}<TextInput label="Time zone" value={prefs.timeZone} onChange={v=>change("timeZone",v)} description="IANA name, for example Europe/London."/></VStack>}
   </Card></VStack>
   <Dialog aria-label="Review source" isOpen={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null);}} width="var(--reply-preview-width)" maxHeight="var(--reply-preview-max-height)">
    <DialogHeader title="Review source" onOpenChange={open=>{if(!open)setSelected(null);}}/>
    {selected&&<VStack padding={4} gap={3} height="var(--reply-preview-height)" isScrollable>
      <Heading level={3}>{selected.title}</Heading>
      {new URL(selected.url).protocol==="https:"&&<Button label="Open source" size="sm" href={selected.url} target="_blank"/>}
      <TextArea label="Source text" value={selected.text} onChange={()=>undefined} rows={16} isDisabled/>
      {selected.fixture&&<Text>Simulation source. Fetch a current source before approval.</Text>}
      <Text role="status">{notice}</Text>
      <HStack hAlign="end"><Button label="Approve" size="sm" variant="primary" isDisabled={busy||selected.fixture} onClick={()=>void approve()}/></HStack>
    </VStack>}
   </Dialog>
 </VStack>;
}
function NotificationRow({icon,title,description,value,onChange}:{icon:typeof AtSymbolIcon;title:string;description:string;value:boolean;onChange:(value:boolean)=>void}){
 return <HStack gap={3} hAlign="between" vAlign="center" padding={4}><HStack gap={3}><Icon icon={icon}/><VStack gap={1}><Text weight="semibold">{title}</Text><Text type="supporting" color="secondary">{description}</Text></VStack></HStack><Switch label={title+" notifications"} value={value} onChange={onChange}/></HStack>;
}
