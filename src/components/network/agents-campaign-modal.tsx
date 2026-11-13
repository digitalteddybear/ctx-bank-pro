"use client";
import { useReplyTemplatePreview } from "@/lib/reply-template-preview";
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Users, Mail, Send } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { campaignOverviewSchema, campaignSummarySchema, campaignSegmentSchema, campaignTemplatePreviewSchema } from '@/lib/outreach-campaign-contract';
import { requestBackendSync, useBackendRefresh } from '@/lib/backend-sync';

type ReplyRule = {id:string;enabled:boolean;text?:string};

export function AgentsCampaignModal({isOpen,onOpenChange}:{isOpen:boolean;onOpenChange:(open:boolean)=>void}) {
  const [step,setStep]=useState(0);
  const [senderName,setSenderName]=useState('Dylan');
  const [senderEmail,setSenderEmail]=useState('dylan@aspinvest.co.uk');
  const [appPassword,setAppPassword]=useState('');
  const [liveDelivery,setLiveDelivery]=useState(false);
  const [connection,setConnection]=useState<{smtp:boolean;imap:boolean}>();
  const [overview,setOverview]=useState<z.infer<typeof campaignOverviewSchema>>();
  const [segment,setSegment]=useState<z.infer<typeof campaignSegmentSchema>>('all');
  const [batchSize,setBatchSize]=useState('25');
  const [openingMessage,setOpeningMessage]=useState('');
  const openingMessageRef=useRef<HTMLTextAreaElement>(null);
  const [standardFooter,setStandardFooter]=useState('');
  const [replyPreviewOpen,setReplyPreviewOpen]=useState(false);
  const [replyHtmlTemplate,setReplyHtmlTemplate]=useState('<html><body style="font-family:Arial,sans-serif;color:#202124"><div>{{message}}</div></body></html>');
  const replyPreview = useReplyTemplatePreview(replyHtmlTemplate);
  const [templateName,setTemplateName]=useState('');
  const [templateFile,setTemplateFile]=useState<File|null>(null);
  const [templateContacts,setTemplateContacts]=useState<{id:string;label:string}[]>([]);
  const [previewLeadId,setPreviewLeadId]=useState('');
  const [templatePreview,setTemplatePreview]=useState<z.infer<typeof campaignTemplatePreviewSchema>>();
  const [replyObjectives,setReplyObjectives]=useState<string[]>(['answer-questions']);
  const [customRule,setCustomRule]=useState('');
  const [replyRules,setReplyRules]=useState<ReplyRule[]>([{id:'tone',enabled:true},{id:'no-advice',enabled:true},{id:'no-promises',enabled:true},{id:'no-pressure',enabled:true},{id:'use-evidence',enabled:true},{id:'opt-out',enabled:true},{id:'liaison-role',enabled:true}]);
  const [mode,setMode]=useState('review-required');
  const [permissionGranted,setPermissionGranted]=useState(false);
  const [permissionReference,setPermissionReference]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState('');
  const request=useRef<{key:string;id:string}|null>(null);
  const preferencesDirty=useRef(false);
  const refresh=useCallback(async()=>{
    if(!isOpen)return;
    try { const response=await fetch(`/api/agents/campaign?segment=${encodeURIComponent(segment)}`,{cache:'no-store'});if(!response.ok)throw new Error('Could not load campaign status.');const data=campaignOverviewSchema.parse(await response.json());setOverview(data);setTemplateContacts(data.templateContacts??[]);if(!previewLeadId&&data.templateContacts?.[0])setPreviewLeadId(data.templateContacts[0].id);if(previewLeadId&&!data.templateContacts?.some(contact=>contact.id===previewLeadId))setPreviewLeadId(data.templateContacts?.[0]?.id??'');if(!preferencesDirty.current){setOpeningMessage(data.preferences.openingMessage);setStandardFooter(data.preferences.standardFooter);setReplyHtmlTemplate(data.preferences.replyHtmlTemplate??'');setReplyObjectives(data.preferences.replyObjectives);setReplyRules(data.preferences.replyRules);} }
    catch(cause){setError(cause instanceof Error?cause.message:'Could not load campaign status.');}
  },[isOpen,segment,previewLeadId]);
  useBackendRefresh(refresh);
  useEffect(()=>{if(isOpen)void refresh();},[isOpen,refresh]);
  const selected=overview?.cohorts.find(cohort=>cohort.id===segment);
  useEffect(()=>{if(!isOpen)return;void fetch('/api/agents/credentials',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(v=>{const c=z.object({senderName:z.string(),email:z.string(),liveDelivery:z.boolean()}).parse(v);setSenderName(c.senderName);setSenderEmail(c.email);setLiveDelivery(c.liveDelivery);}).catch(()=>setError('Could not load sender settings.'));},[isOpen]);
  const senderAction=async(save:boolean)=>{setBusy(true);setError('');try{const body=save?{credentials:{senderName,email:senderEmail,password:appPassword},liveDelivery}:{senderName,email:senderEmail,password:appPassword};const r=await fetch(save?'/api/agents/credentials':'/api/agents/credentials/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw new Error(v.error??'Sender check failed.');setConnection({smtp:Boolean(v.smtp),imap:Boolean(v.imap)});if(save){setAppPassword('');requestBackendSync();setResult(v.restartWorker?'Sender saved. Restart the local worker before delivery.':'Sender saved. The worker will reload it automatically.');}}catch(e){setError(e instanceof Error?e.message:'Sender check failed.');}finally{setBusy(false);}};
  const isStepValid=(index:number)=>index===0
    ?true
    :index===1
      ?true
      :Boolean(openingMessage.trim()&&replyObjectives.length);
  const stepMessage=(index:number)=>index===0
    ?'Test SMTP and IMAP with the current sender credentials before continuing.'
    :index===1
      ?'Select an available cohort and one of the supported batch sizes.'
      :'Add an opening message and at least one reply objective.';
  const moveToStep=(target:number)=>{
    if(target>step){
      for(let current=step;current<target;current++){
        if(!isStepValid(current)){setError(stepMessage(current));return;}
      }
    }
    setError('');setStep(Math.max(0,Math.min(2,target)));
  };
  const submitCampaign=()=>{
    if(!selected?.available||![10,25,50,135].includes(Number(batchSize))){setStep(1);setError('Select an available cohort and supported batch size before preparing a batch.');return;}
    const invalidStep=[0,1,2].find(index=>!isStepValid(index));
    if(invalidStep!==undefined){setStep(invalidStep);setError(stepMessage(invalidStep));return;}
    void prepare();
  };

  const insertMessageField=(token:string)=>{
    const input=openingMessageRef.current;
    const start=input?.selectionStart??openingMessage.length;
    const end=input?.selectionEnd??openingMessage.length;
    const next=openingMessage.slice(0,start)+token+openingMessage.slice(end);
    setOpeningMessage(next);setTemplatePreview(undefined);preferencesDirty.current=true;
    requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+token.length,start+token.length);});
  };
  const loadTemplate=(file:File|null|undefined)=>{
    if(!file)return;
    if(!/\.(txt|md)$/i.test(file.name)){setError('Choose a .txt or .md template.');return;}
    if(file.size>20000){setError('Template must be 20 KB or smaller.');return;}
    void file.text().then(text=>{setError('');setTemplateName(file.name);setOpeningMessage(text);preferencesDirty.current=true;}).catch(()=>setError('Could not read the template file.'));
  };
  const addRule=()=>{
    const text=customRule.trim();
    if(!text)return;
    const id=`custom-${crypto.randomUUID().slice(0,12)}`;
    setReplyRules(current=>[...current,{id,enabled:true,text}]);
    setCustomRule('');preferencesDirty.current=true;
  };
  const previewTemplate=async()=>{
    setBusy(true);setError('');
    try{const response=await fetch('/api/agents/campaign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'preview-template',segment,leadId:previewLeadId,template:openingMessage})});const value:unknown=await response.json();if(!response.ok){const issue=z.object({error:z.string()}).safeParse(value);throw new Error(issue.success?issue.data.error:'Could not preview template.');}setTemplatePreview(campaignTemplatePreviewSchema.parse(value));}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not preview template.');setTemplatePreview(undefined);}
    finally{setBusy(false);}
  };

  const control=async(id:string,action:'pause-batch'|'resume-batch'|'cancel-batch')=>{
    setBusy(true);setError('');
    try {const response=await fetch('/api/agents/campaign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,action})});if(!response.ok)throw new Error('Could not update batch.');await refresh();requestBackendSync();}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not update batch.');}finally{setBusy(false);}
  };
  const savePreferences=async()=>{setBusy(true);try{const response=await fetch('/api/agents/campaign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save-preferences',preferences:{openingMessage,standardFooter,replyHtmlTemplate,replyObjectives,replyRules}})});if(!response.ok)throw new Error('Could not save preferences.');preferencesDirty.current=false;await refresh();requestBackendSync();setResult('Message and reply preferences saved.');}catch(e){setError(e instanceof Error?e.message:'Save failed.');}finally{setBusy(false);}};
  const prepare=async()=>{
    setBusy(true);setError('');setResult('');
    const key=JSON.stringify({batchSize,segment,mode});if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
    try {
      const preferenceResponse=await fetch('/api/agents/campaign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save-preferences',preferences:{openingMessage,standardFooter,replyHtmlTemplate,replyObjectives,replyRules}})});
      if(!preferenceResponse.ok)throw new Error('Save the message and reply guidance before preparing the campaign.');
      preferencesDirty.current=false;
      const response=await fetch('/api/agents/campaign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'start-batch',batchSize:Number(batchSize),segment,mode,inference:'live',requestId:request.current.id,permissionGranted,permissionReference})});
      const value:unknown=await response.json();if(!response.ok){const failure=z.object({error:z.string()}).safeParse(value);throw new Error(failure.success?failure.data.error:'Could not prepare batch.');}
      const {batch}=z.object({batch:campaignSummarySchema}).parse(value);
      setResult(`${batch.selected} contacts ${batch.status}. ${batch.reason??''}`);request.current=null;requestBackendSync();await refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not prepare batch.');}finally{setBusy(false);}
  };
  return <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width="min(95vw, 48rem)" maxHeight="90vh">
    <DialogHeader title="Campaign" onOpenChange={onOpenChange}/><VStack padding={4} gap={4} height="78vh" isScrollable>
      <HStack gap={2} wrap="wrap" aria-label="Campaign steps">
        {[{label:"Sender",icon:Send,description:"Set sender details and delivery."},{label:"Cohort",icon:Users,description:"Choose a recipient group and batch size."},{label:"Message & replies",icon:Mail,description:"Edit the opening message and reply design."}].map((item,index)=><VStack key={item.label} gap={1} style={{flex:1,minWidth:150}}><Button label={`${index+1}. ${item.label}`} icon={<item.icon size={16}/>} size="sm" variant={step===index?"primary":"secondary"} onClick={()=>moveToStep(index)}/><Text type="supporting" color="secondary">{item.description}</Text></VStack>)}
      </HStack>
      {step===0&&<Card padding={4}><VStack gap={3}><Text>Configure and verify the sender.</Text><TextInput label="Sender Name" size="sm" value={senderName} onChange={value=>{setSenderName(value);setConnection(undefined);}} isDisabled={busy}/><TextInput label="Sender Email" type="email" size="sm" value={senderEmail} onChange={value=>{setSenderEmail(value);setConnection(undefined);}} isDisabled={busy}/><TextInput label="Google App Password" type="password" size="sm" value={appPassword} onChange={value=>{setAppPassword(value);setConnection(undefined);}} isDisabled={busy} description="Saved privately in CTX; never shown after saving."/><Switch label="Live Delivery" value={liveDelivery} onChange={setLiveDelivery} isDisabled={busy||!connection?.smtp||!connection?.imap}/><HStack gap={2}><Button label="Test Connection" size="sm" onClick={()=>void senderAction(false)} isDisabled={busy||appPassword.replace(/\s/g,'').length!==16||!senderEmail.includes('@')}/><Button label="Save" size="sm" variant="primary" className="button button--primary button--sm" onClick={()=>void senderAction(true)} isDisabled={busy}/></HStack>{connection&&<Text>SMTP {connection.smtp?'Connected':'Failed'} · IMAP {connection.imap?'Reachable':'Failed'}</Text>}</VStack></Card>}
      {step===1&&<Card padding={4}><VStack gap={3}><Text>Choose the Phase 1 cohort and dispatch mode.</Text><Selector label="Cohort" size="sm" value={segment} onChange={v=>setSegment(campaignSegmentSchema.parse(v))} isDisabled={busy||!overview} options={(overview?.cohorts??[]).map(c=>({value:c.id,label:`${c.label} (${c.total}) · ${c.crmIndexed}/${c.total} indexed`}))}/><Switch label="Contact permission" value={permissionGranted} onChange={setPermissionGranted}/><TextInput label="Permission reference" size="sm" value={permissionReference} onChange={setPermissionReference} description="Record the source of permission for the selected contacts."/><Selector label="Batch Size" size="sm" value={batchSize} onChange={setBatchSize} options={[10,25,50,135].map(v=>({value:String(v),label:String(v)}))}/><SegmentedControl label="Dispatch Mode" size="sm" value={mode} onChange={setMode}><SegmentedControlItem value="review-required" label="Review Required"/><SegmentedControlItem value="autonomous-paced" label="Autonomous Paced"/></SegmentedControl>{selected&&<Text>HubSpot {selected.crmSynced}/{selected.total} synced · {selected.crmIndexed}/{selected.total} indexed. {selected.available} available; permission checks remain required.</Text>}</VStack></Card>}
      {step===2&&<Card padding={4}><VStack gap={3}><Text>Configure the opening message and reply guidance.</Text><FileInput label="Opening message template" value={templateFile} onChange={files=>{const file=files instanceof File?files:null;setTemplateFile(file);loadTemplate(file);}} accept=".txt,.md,text/plain,text/markdown" maxSize={20000} description="TXT or Markdown · maximum 20 KB" placeholder="Choose template" isDisabled={busy}/>{templateName&&<Text type="supporting">{templateName}</Text>}<HStack gap={2} wrap="wrap">{[["First name","{{First name}}"],["Last name","{{Last name}}"],["Email","{{Email}}"],["Sender","{{Sender}}"],["Sender email","{{Sender email}}"],["Firm","{{Firm}}"],["Role","{{Role}}"],["Macro interest","{{Macro interest}}"],["Tailored hook","{{Tailored hook}}"],["Privacy footer","{{Standard company and privacy footer}}"]].map(([label,token])=><Button key={token} label={label} size="sm" variant="secondary" onClick={()=>insertMessageField(token)}/>)}</HStack><TextArea ref={openingMessageRef} label="First Message" rows={6} maxLength={8000} value={openingMessage} onChange={value=>{preferencesDirty.current=true;setOpeningMessage(value);setTemplatePreview(undefined);}} description="Insert a field at the cursor. Contact fields use synced HubSpot values, then dossier evidence; sender fields use sender settings."/><TextArea label="Company and privacy footer" rows={3} maxLength={2000} value={standardFooter} onChange={value=>{preferencesDirty.current=true;setStandardFooter(value);setTemplatePreview(undefined);}} description="Enter approved footer text for {{Standard company and privacy footer}}."/><Text>Cal.com links are sent only in replies when requested or welcome. Missing profile or footer values are flagged in preview.</Text><HStack gap={2}><Selector label="Preview Contact" size="sm" value={previewLeadId} onChange={value=>{setPreviewLeadId(value);setTemplatePreview(undefined);}} options={templateContacts.map(contact=>({value:contact.id,label:contact.label}))} isDisabled={busy||!templateContacts.length}/><Button label="Preview" size="sm" onClick={()=>void previewTemplate()} isDisabled={busy||!openingMessage.trim()||!previewLeadId}/></HStack>{templatePreview&&<VStack gap={2}><Text type="supporting">Preview for {templatePreview.leadName}</Text><TextArea label="Rendered message" rows={6} value={templatePreview.text} onChange={()=>undefined} isDisabled/>{templatePreview.missing.length>0&&<Text role="alert">Missing values: {templatePreview.missing.join(', ')}</Text>}</VStack>}<TextArea label="Reply HTML template" rows={6} maxLength={20000} value={replyHtmlTemplate} onChange={value=>{preferencesDirty.current=true;setReplyHtmlTemplate(value);}} description="HTML used for agent replies after the prospect responds. Put {{message}} where the reply text belongs."/><Button label="Expand preview" size="sm" onClick={()=>setReplyPreviewOpen(true)}/><Text type="label">Reply preview</Text>{replyPreview.error&&<Text role="alert">{replyPreview.error}</Text>}<iframe title="Campaign reply email preview" sandbox="" srcDoc={replyPreview.html} style={{width:"100%",height:200,border:"1px solid var(--color-border)",borderRadius:"var(--radius-medium)",background:"white"}}/><CheckboxList label="Reply objectives" value={replyObjectives} onChange={values=>{preferencesDirty.current=true;setReplyObjectives(values);}} hasDividers>
          <CheckboxListItem value="book-call" label="Book a call" description="Offer a call when the prospect shows interest or requests one."/>
          <CheckboxListItem value="visit-website" label="Visit website" description="Share the approved website when useful to the conversation."/>
          <CheckboxListItem value="answer-questions" label="Answer questions" description="Respond directly using approved, verified information."/>
          <CheckboxListItem value="qualify-interest" label="Understand interest" description="Clarify stated interests without assessing eligibility."/>
          <CheckboxListItem value="send-information" label="Send information" description="Offer approved information relevant to the request."/>
          <CheckboxListItem value="human-handoff" label="Hand off to Dylan" description="Offer a human response when the agent should not continue."/>
        </CheckboxList>
        <CheckboxList label="Reply rules" value={replyRules.filter(rule=>rule.enabled).map(rule=>rule.id)} onChange={values=>{preferencesDirty.current=true;setReplyRules(current=>current.map(rule=>({...rule,enabled:values.includes(rule.id)})));}} hasDividers>
          {replyRules.map(rule=><CheckboxListItem key={rule.id} value={rule.id} label={rule.text??({tone:'Professional tone','no-advice':'No investment advice','no-promises':'No return promises','no-pressure':'No pressure','use-evidence':'Use verified facts','opt-out':'Honor opt-outs','liaison-role':'Use liaison role'} as Record<string,string>)[rule.id]??rule.id} description={rule.text??({tone:'Keep responses concise, clear and professional.','no-advice':'Do not make recommendations or suitability claims.','no-promises':'Do not promise returns or outcomes.','no-pressure':'Respect declined invitations and avoid repeated asks.','use-evidence':'Use conversation and dossier evidence; preserve unknowns.','opt-out':'Stop outreach immediately when asked.','liaison-role':'Describe ASP as a private-market liaison, not an adviser.'} as Record<string,string>)[rule.id]??''}/>)}</CheckboxList><HStack gap={2}><TextInput label="Add reply rule" size="sm" value={customRule} onChange={setCustomRule} isDisabled={busy}/><Button label="Add" size="sm" onClick={addRule} isDisabled={busy||!customRule.trim()||replyRules.length>=20}/></HStack><Button label="Save" size="sm" variant="primary" className="button button--primary button--sm" onClick={()=>void savePreferences()}/><Text>Review: {selected?.label} · {batchSize} max · {senderEmail||'Sender required'}</Text><Text>Save keeps configuration. Launch queues the selected cohort; review mode requires message approval.</Text></VStack></Card>}
      {error&&<Text role="alert">{error}</Text>}{result&&<Text role="status">{result}</Text>}
      <HStack gap={2} hAlign="between"><Button label="Close" size="sm" onClick={()=>onOpenChange(false)}/><HStack gap={2}><Button label="Save" size="sm" variant="primary" className="button button--primary button--sm" onClick={()=>void savePreferences()}/>{step>0&&<Button label="Back" size="sm" onClick={()=>moveToStep(step-1)}/ >}{step<2?<Button label="Next" size="sm" variant="primary" onClick={()=>moveToStep(step+1)}/>:<Button label="Launch" size="sm" variant="primary" isDisabled={busy} onClick={submitCampaign}/>}</HStack></HStack>
      {overview?.batches.map(batch=><HStack key={batch.id} gap={2} wrap="wrap"><Text type="supporting">{new Date(batch.createdAt).toLocaleDateString()} · {batch.selected} contacts · {batch.status}</Text><Button size="sm" label={batch.status==='paused'?'Resume':'Pause'} isDisabled={busy||batch.status==='cancelled'} onClick={()=>void control(batch.id,batch.status==='paused'?'resume-batch':'pause-batch')}/>{batch.status!=='cancelled'&&<Button label="Cancel" size="sm" isDisabled={busy} onClick={()=>void control(batch.id,'cancel-batch')}/>}</HStack>)}
    </VStack><Dialog isOpen={replyPreviewOpen} onOpenChange={setReplyPreviewOpen} purpose="form" width="min(88vw, 64rem)" maxHeight="82vh"><DialogHeader title="Reply template preview" onOpenChange={setReplyPreviewOpen}/><HStack padding={4} gap={4} style={{height:"62vh",alignItems:"stretch"}}><VStack gap={2} style={{width:"42%",minWidth:320}}><TextArea label="HTML template" rows={20} value={replyHtmlTemplate} onChange={value=>{preferencesDirty.current=true;setReplyHtmlTemplate(value);}}/><Text type="supporting">Preview updates as you edit. Use {'{{message}}'} for the reply.</Text></VStack><iframe title="Expanded campaign email preview" sandbox="" srcDoc={replyPreview.html} style={{flex:1,minWidth:0,border:"1px solid var(--color-border)",borderRadius:"var(--radius-medium)",background:"white"}}/></HStack></Dialog></Dialog>;
}
