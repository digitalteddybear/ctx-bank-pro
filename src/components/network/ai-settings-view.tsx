'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@astryxdesign/core/Toast';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { NotificationSettings } from './notification-settings';
import Image from 'next/image';
import { LogOut } from 'lucide-react';
import { z } from 'zod';
import { Card } from '@astryxdesign/core/Card';
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Icon } from '@astryxdesign/core/Icon';
import { UserIcon, LockClosedIcon, BellIcon, PaintBrushIcon, ShieldCheckIcon, PuzzlePieceIcon, CpuChipIcon, KeyIcon, AdjustmentsHorizontalIcon, ArrowPathIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { OutreachOperationsPanel } from './outreach-operations-panel';
import { ThemePreferenceControl } from '@/components/ui/theme-switch';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Slider } from '@astryxdesign/core/Slider';
import { Switch } from '@astryxdesign/core/Switch';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { DEFAULT_AI_SETTINGS, AI_SETTINGS_STORAGE_KEY, aiSettingsSchema, aiSettingsSnapshotSchema, openAIModelCatalogSchema, openAIOAuthStatusSchema, providerStatusSchema, type AISettings } from '@/lib/ai-settings';

const PROVIDERS = [
  {value:'auto',label:'Automatic'},
  {value:'openrouter',label:'OpenRouter'},
  {value:'openai',label:'OpenAI'},
  {value:'openai-oauth',label:'OpenAI ChatGPT'},
  {value:'anthropic',label:'Anthropic'},
  {value:'openai-compatible',label:'OpenAI-compatible'},
  {value:'ollama',label:'Ollama'},
];
const PERSONAS = ['App Architect','Credit Analyst','Direct Outbound Copywriter','Code Auditor'].map(value => ({value,label:value}));
const PLANNING = [{value:'direct',label:'Direct Execution'},{value:'tree-search',label:'Multi-Step Tree Search'}];
const PROVIDER_BRANDS=[
  {name:'OpenAI',slug:'openai',key:'openai' as const,description:'OpenAI API and ChatGPT account'},
  {name:'OpenRouter',slug:'openrouter',key:'openrouter' as const,description:'Hosted models through OpenRouter'},
  {name:'Anthropic',slug:'anthropic',key:'anthropic' as const,description:'Claude API'},
  {name:'DeepSeek',slug:'deepseek',key:null,description:'OpenAI-compatible endpoint'},
  {name:'Google',slug:'google',key:null,description:'Gemini API'},
  {name:'Groq',slug:'groq',key:null,description:'OpenAI-compatible endpoint'},
  {name:'Mistral',slug:'mistral',key:null,description:'OpenAI-compatible endpoint'},
];
type ProviderStatus = z.infer<typeof providerStatusSchema>;

export function AISettingsView() {
  const [keyProvider,setKeyProvider]=useState("openai");
  const [keyValue,setKeyValue]=useState("");
  const [keyNotice,setKeyNotice]=useState("");
  const [keyBusy,setKeyBusy]=useState(false);
  const narrowSettings=useMediaQuery('(max-width: 720px)');
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [oauthStatus, setOAuthStatus] = useState<{connected:boolean;email:string|null;canUsePlan:boolean;scopes:string[];expiresAt:number|null}|null>(null);
  const [oauthModels,setOAuthModels]=useState<{id:string;name:string}[]>([]);
  const [oauthPending,setOAuthPending]=useState(false);
  const [oauthError,setOAuthError]=useState('');
  const [outreachStatus,setOutreachStatus]=useState('');
  const [outreachPending,setOutreachPending]=useState(false);
  const [section,setSection]=useState('Models');
  const [search,setSearch]=useState('');
  const toast=useToast();
  const [settingsRevision,setSettingsRevision]=useState<number|null>(null);
  const [settingsSaving,setSettingsSaving]=useState(false);
  const [settingsNotice,setSettingsNotice]=useState('');
  const settingsDirty=useRef(false);
  const latestSettings=useRef(settings);
  latestSettings.current=settings;
  const [securityTab,setSecurityTab]=useState('login');
  const [signingOut,setSigningOut]=useState(false);
  const sections=[
    {group:'Account',name:'Profile',description:'Operator profile details.',icon:UserIcon},
    {group:'Account',name:'Login & security',description:'Account access and security.',icon:LockClosedIcon},
    {group:'Workspace',name:'Appearance',description:'Choose the application theme.',icon:PaintBrushIcon},
    {group:'Workspace',name:'Notifications',description:'Review sources and operator issues.',icon:BellIcon},
    {group:'Advanced',name:'Privacy',description:'Control AI context and data use.',icon:ShieldCheckIcon},
    {group:'Advanced',name:'Connected apps',description:'Manage HubSpot and Cal.com.',icon:PuzzlePieceIcon},
    {group:'AI',name:'Models',description:'Choose models for each CTX task.',icon:CpuChipIcon},
    {group:'AI',name:'Reasoning',description:'Set reasoning and response limits.',icon:AdjustmentsHorizontalIcon},
    {group:'AI',name:'Planning',description:'Set execution and response style.',icon:ArrowPathIcon},
    {group:'AI',name:'Providers',description:'Connect model providers and accounts.',icon:KeyIcon},
  ];
  const visibleSections=sections.filter(item=>(item.name+' '+item.description+' '+item.group).toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    const query=new URLSearchParams(window.location.search);
    if(query.get('section')==='Notifications')setSection('Notifications');
    const oauthResult=query.get('openai_oauth');
    const oauthReason=query.get('reason');
    const messages:Record<string,string>={discovery:'CTX could not load OpenAI sign-in metadata. Check the local server network connection.',callback:'The saved callback is not a valid local address. Restart sign-in from the local CTX app.', 'callback-port':'The callback reached a different local port. Keep CTX running at the same URL where you started sign-in, then retry.', 'callback-path':'The callback path did not match. Restart sign-in from AI Settings.',state:'The sign-in expired or its security state did not match. Start again.',provider:'OpenAI declined or cancelled sign-in. Check account eligibility and the consent selection.',registration:'OpenAI did not complete client registration. Start a fresh sign-in.',token:'OpenAI rejected the authorization code exchange. Start a fresh sign-in; the code may have expired or the callback port may differ.',identity:'OpenAI identity verification failed. No credentials were saved.',account:'The linked registration belongs to another account. Disconnect the existing account first.',storage:'CTX could not save credentials to the private local config directory.'};
    if(oauthResult==='error')setOAuthError(messages[oauthReason??'']??'OpenAI sign-in did not complete. Restart sign-in and share the displayed reason code if it fails again.');
    if(oauthResult==='connected'||oauthResult==='error')window.history.replaceState({},'',`${window.location.pathname}?view=ai-settings`);
    try {
      const stored = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
      if (stored) setSettings(aiSettingsSchema.parse(JSON.parse(stored)));
    } catch { /* Server settings remain available when browser storage is blocked. */ }
    void fetch('/api/ai-workspace/settings',{cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error('Could not load AI settings.');
      const saved=aiSettingsSnapshotSchema.parse(await response.json());
      setSettingsRevision(saved.revision);
      if(!settingsDirty.current){
        if(saved.revision>0)setSettings(saved.settings);
        else setSettings(current=>({...current,models:{...current.models,leadOutreach:saved.settings.models.leadOutreach}}));
      }
    }).catch(()=>setSettingsNotice('Could not load saved settings. Reload to retry.'));

    void fetch('/api/ctx-app-agent', {cache:'no-store'}).then(async response => {
      if (response.ok) setProviders(providerStatusSchema.parse(await response.json()));
    }).catch(() => setProviders(null));
    void fetch('/api/auth/openai',{cache:'no-store'}).then(async response=>{
      if(!response.ok)return;
      const status=openAIOAuthStatusSchema.parse(await response.json());setOAuthStatus(status);
      if(status.connected&&status.canUsePlan){const modelResponse=await fetch('/api/auth/openai?resource=models',{cache:'no-store'});if(modelResponse.ok)setOAuthModels(openAIModelCatalogSchema.parse(await modelResponse.json()).models);}
    }).catch(()=>setOAuthStatus(null));
  }, []);
  const update = (next: AISettings) => {
    settingsDirty.current=true;
    setSettings(next);
    setSettingsNotice("Unsaved changes.");
  };
  const saveSettings=async()=>{
    if(settingsSaving||settingsRevision===null)return;
    const draft=settings;
    setSettingsSaving(true);setSettingsNotice('');
    try{
      const response=await fetch('/api/ai-workspace/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({settings:draft,revision:settingsRevision})});
      const raw:unknown=await response.json();
      if(!response.ok)throw new Error(raw&&typeof raw==='object'&&'error'in raw?String(raw.error):'Could not save settings.');
      const saved=aiSettingsSnapshotSchema.parse(raw);
      setSettingsRevision(saved.revision);
      settingsDirty.current=latestSettings.current!==draft;
      setSettingsNotice(settingsDirty.current?'Saved. New edits are unsaved.':'Saved.');
      try{localStorage.setItem(AI_SETTINGS_STORAGE_KEY,JSON.stringify(saved.settings));}catch{/* Server remains authoritative. */}
      toast({body:'AI settings saved.',uniqueID:'ai-settings-save'});
    }catch(error){
      const message=error instanceof Error?error.message:'Could not save settings.';
      setSettingsNotice(message);toast({body:message,type:'error',uniqueID:'ai-settings-save'});
    }finally{setSettingsSaving(false);}
  };
  const modelField = (name: keyof AISettings['models'], label: string) => {
    const model = settings.models[name];
    const isOAuthModel=model.provider==='openai-oauth';
    return <VStack key={name} gap={2}>
      <Heading level={4}>{label}</Heading>
      <Grid columns={{minWidth:220,repeat:'fit'}} gap={2}>
        <Selector label={`${label} provider`} options={PROVIDERS} value={model.provider} size="sm" onChange={provider => provider && update({...settings,models:{...settings.models,[name]:{...model,provider:provider as typeof model.provider}}})} />
        {isOAuthModel&&oauthModels.length>0
          ? <Selector label={`${label} model`} options={oauthModels.map(option=>({value:option.id,label:option.name}))} value={model.model} size="sm" onChange={value=>value&&update({...settings,models:{...settings.models,[name]:{...model,model:value}}})} />
          : <TextInput label={`${label} model ID`} size="sm" value={model.model} placeholder="Enter the provider model ID" onChange={value => update({...settings,models:{...settings.models,[name]:{...model,model:value}}})} />}
      </Grid>
      {isOAuthModel&&oauthStatus?.connected&&!oauthStatus.canUsePlan&&<Text type="supporting" color="secondary">This account did not grant ChatGPT plan inference. Reconnect and approve the plan usage scope.</Text>}
      {name === 'appEditor' && <TextInput label="App Editor target file" size="sm" value={settings.models.appEditor.targetFile} placeholder="src/components/network/mission-control-view.tsx" description="Use a repository path. CTX stores proposed changes as reviewable drafts." onChange={targetFile => update({...settings,models:{...settings.models,appEditor:{...settings.models.appEditor,targetFile}}})} />}
    </VStack>;
  };
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch('/api/session', {method:'DELETE'});
    } finally {
      window.location.assign('/login');
    }
  };
  return <Layout height="fill" contentWidth={1500} start={narrowSettings?undefined:<LayoutPanel width={280} hasDivider padding={3} role="navigation"><VStack gap={4}><Heading level={2}>Settings</Heading><TextInput label="Search settings" isLabelHidden size="sm" value={search} onChange={setSearch} placeholder="Search settings"/>{['Account','Workspace','Advanced','AI'].map(group=>{const items=visibleSections.filter(item=>item.group===group);return items.length?<VStack key={group} gap={1}><Text type="supporting" color="secondary" style={{marginInline:'var(--spacing-4)'}}>{group}</Text><List density="spacious">{items.map(item=><ListItem key={item.name} label={item.name} startContent={<Icon icon={item.icon}/>} isSelected={section===item.name} onClick={()=>setSection(item.name)}/>)}</List></VStack>:null})}</VStack></LayoutPanel>} content={<LayoutContent isScrollable padding={narrowSettings?4:6}><VStack gap={6}>{narrowSettings&&<VStack gap={3}><Heading level={2}>Settings</Heading><Selector label="Section" size="sm" value={section} onChange={setSection} options={sections.map(item=>({value:item.name,label:item.name}))}/></VStack>}<VStack gap={1}><Heading level={1}>{section}</Heading><Text type="supporting" color="secondary">{section==='Notifications'?'What reaches you, and where it arrives.':sections.find(item=>item.name===section)?.description}</Text></VStack><VStack gap={4} style={{width:'100%'}}>
      {section==='Profile'&&<VStack gap={6}><VStack gap={4}><SettingsInfoRow label="Name" value="Not configured"/><SettingsInfoRow label="Email address" value="Managed by the server deployment"/><SettingsInfoRow label="Operator profile" value="CTX administrator"/></VStack><Card padding={4}><VStack gap={4}><HStack gap={3} vAlign="start"><Icon icon={LockClosedIcon}/><VStack gap={1}><Text weight="semibold">Profile details</Text><Text type="supporting" color="secondary">Account identity is managed by the CTX server deployment.</Text></VStack></HStack><Divider/><HStack gap={3} vAlign="start"><Icon icon={UserIcon}/><VStack gap={1}><Text weight="semibold">Operator access</Text><Text type="supporting" color="secondary">Only the configured administrator can change application settings.</Text></VStack></HStack></VStack></Card><HStack hAlign="end"><Button label="Sign out" size="sm" variant="secondary" icon={<LogOut size={15}/>} isLoading={signingOut} isDisabled={signingOut} onClick={()=>void signOut()}/></HStack></VStack>}
      {section==='Login & security'&&<VStack gap={6}><TabList value={securityTab} onChange={setSecurityTab} hasDivider><Tab value="login" label="Login"/><Tab value="shared" label="Shared access"/></TabList>{securityTab==='login'?<VStack gap={8}><VStack gap={4}><Heading level={3}>Login</Heading><Divider/><SettingsInfoRow label="Authentication" value="Managed by the CTX server deployment"/><SettingsInfoRow label="Provider credentials" value="Encrypted and stored on the server"/></VStack><VStack gap={4}><Heading level={3}>Social accounts</Heading><Divider/><SettingsInfoRow label="Google" value="Not connected"/></VStack><VStack gap={4}><Heading level={3}>Device history</Heading><Divider/><HStack gap={3} vAlign="start"><Icon icon={ComputerDesktopIcon}/><VStack gap={1}><Text weight="semibold">Current browser</Text><Text type="supporting" color="secondary">Active CTX session</Text></VStack><Badge label="Current"/></HStack><Divider/></VStack></VStack>:<VStack gap={4}><Heading level={3}>Shared access</Heading><Divider/><Card padding={4}><HStack gap={3} vAlign="start"><Icon icon={LockClosedIcon}/><VStack gap={1}><Text weight="semibold">Shared access</Text><Text type="supporting" color="secondary">No shared accounts are configured for this CTX deployment.</Text></VStack></HStack></Card></VStack>}</VStack>}
      {section==='Appearance'&&<Card padding={4}><VStack gap={4}><Heading level={2}>Appearance</Heading><Text type='supporting' color='secondary'>Preview the application theme while choosing System, Dark or Light.</Text><ThemePreferenceControl/><Card padding={4}><VStack gap={2}><Heading level={3}>Preview</Heading><Text>CTX settings preview</Text><Button label='Action preview' size='sm' variant='primary'/></VStack></Card></VStack></Card>}
      {['Models','Reasoning','Planning'].includes(section)&&<HStack gap={3} hAlign="between" vAlign="center"><Text type="supporting" role="status">{settingsNotice||'Save changes for use across sessions.'}</Text><Button label="Save" size="sm" variant="primary" className="button button--primary button--sm" isLoading={settingsSaving} isDisabled={settingsSaving||settingsRevision===null} onClick={()=>void saveSettings()}/></HStack>}
      {section==='Models'&&<Card padding={4}><VStack gap={4}><VStack gap={1}><Heading level={2}>Models</Heading><Text type="supporting" color="secondary">Model IDs are provider-specific. Enter the exact ID from your provider.</Text></VStack><Selector label="Routing" options={[{value:'automatic',label:'Automatic by task'},{value:'manual',label:'Manual model selection'}]} value={settings.routing} size="sm" onChange={value=>value&&update({...settings,routing:value as AISettings['routing']})}/>{modelField('generalChat','General Chat')}{modelField('appEditor','App Editor')}{modelField('leadOutreach','Lead Outreach')}{modelField('codeAnalysis','Code Analysis')}</VStack></Card>}
      {section==='Reasoning'&&<><Card padding={4}><VStack gap={4}><Heading level={2}>Reasoning</Heading><Switch label="Extended Thinking" description="Request higher reasoning effort when supported by the selected model." value={settings.reasoning.extended} onChange={extended=>update({...settings,reasoning:{...settings.reasoning,extended}})}/><Slider label="Response token limit" min={1024} max={64000} step={1024} value={settings.reasoning.tokenBudget} valueDisplay="text" formatValue={value=>`${value.toLocaleString()} tokens`} onChange={(tokenBudget:number)=>update({...settings,reasoning:{...settings.reasoning,tokenBudget}})}/><Switch label="Show request details" description="Display provider and model. Private reasoning text is not exposed." value={settings.reasoning.showTrace} onChange={showTrace=>update({...settings,reasoning:{...settings.reasoning,showTrace}})}/></VStack></Card><Card padding={4}><VStack gap={4}><Heading level={2}>Model Parameters</Heading><Slider label="Temperature" min={0} max={2} step={0.05} value={settings.sampling.temperature} valueDisplay="text" formatValue={value=>value.toFixed(2)} onChange={(temperature:number)=>update({...settings,sampling:{...settings.sampling,temperature}})}/><Slider label="Top-P" min={0} max={1} step={0.01} value={settings.sampling.topP} valueDisplay="text" formatValue={value=>value.toFixed(2)} onChange={(topP:number)=>update({...settings,sampling:{...settings.sampling,topP}})}/><Slider label="Frequency penalty" min={-2} max={2} step={0.1} value={settings.sampling.frequencyPenalty} valueDisplay="text" formatValue={value=>value.toFixed(1)} onChange={(frequencyPenalty:number)=>update({...settings,sampling:{...settings.sampling,frequencyPenalty}})}/></VStack></Card></>}
      {section==='Planning'&&<><Card padding={4}><VStack gap={4}><Heading level={2}>Planning</Heading><Selector label="Planning mode" options={PLANNING} value={settings.planning} size="sm" onChange={value=>value&&update({...settings,planning:value as AISettings['planning']})}/></VStack></Card><Card padding={4}><VStack gap={4}><Heading level={2}>Personas</Heading><Selector label="System persona" options={PERSONAS} value={settings.persona} size="sm" onChange={value=>value&&update({...settings,persona:value as AISettings['persona']})}/></VStack></Card></>}
      {section==='Providers'&&<VStack gap={5}><VStack gap={2}><Heading level={2}>Providers</Heading><Text color="secondary">API keys are encrypted on the server and never returned to the browser.</Text></VStack><Grid columns={{minWidth:240,repeat:'fit'}} gap={4}>{PROVIDER_BRANDS.map(brand=>{const ready=brand.key?providers?.[brand.key]:undefined;return <Card key={brand.slug} padding={4}><HStack gap={3} vAlign="center"><Image src={`/assets/providers/${brand.slug}.svg`} alt="" width={36} height={36}/><VStack gap={2}><Text weight="semibold">{brand.name}</Text><Text type="supporting" color="secondary">{brand.description}</Text></VStack></HStack><VStack gap={2} style={{marginTop:'var(--spacing-4)'}}><Badge label={ready===undefined?'Configure':ready?'Connected':'Not connected'} variant={ready?'success':'neutral'}/></VStack></Card>})}</Grid><Card padding={4}><VStack gap={4}><Heading level={3}>API key</Heading><Selector label="Provider" size="sm" value={keyProvider} onChange={setKeyProvider} options={[...PROVIDERS.filter(provider=>['openai','openrouter','anthropic','openai-compatible'].includes(provider.value)),{value:'hubspot',label:'HubSpot'},{value:'cal',label:'Cal.com'}]}/><TextInput label="API key" type="password" size="sm" value={keyValue} onChange={setKeyValue}/><Button label="Save" size="sm" variant="primary" isDisabled={keyBusy||!keyValue.trim()} onClick={async()=>{setKeyBusy(true);try{const response=await fetch('/api/agents/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:keyProvider,value:keyValue})});if(!response.ok){const data:unknown=await response.json();throw new Error(data&&typeof data==='object'&&'error'in data?String(data.error):'Key was not saved.');}setKeyValue('');setKeyNotice('API key saved.');const status=await fetch('/api/ctx-app-agent');if(status.ok)setProviders(providerStatusSchema.parse(await status.json()));}catch(error){setKeyNotice(error instanceof Error?error.message:'Key was not saved.');}finally{setKeyBusy(false);}}}/>{keyNotice&&<Text role="status">{keyNotice}</Text>}</VStack></Card><Card padding={4}><VStack gap={4}><Heading level={3}>OpenAI ChatGPT</Heading><HStack gap={3} vAlign="center" hAlign="between"><VStack gap={2}><Text weight="semibold">{oauthStatus?.email??'ChatGPT account'}</Text><Text type="supporting" color="secondary">{oauthStatus?.connected?(oauthStatus.canUsePlan?'Plan inference enabled':'Plan inference not authorized'):'OAuth connection'}</Text></VStack><Badge label={oauthStatus===null?'Checking':oauthStatus.connected?'Connected':'Not connected'} variant={oauthStatus?.connected?'success':'neutral'}/></HStack><HStack gap={2}><Button label={oauthStatus?.connected?'Reconnect OpenAI':'Connect OpenAI'} size="sm" variant="secondary" isLoading={oauthPending} isDisabled={oauthPending} onClick={async()=>{setOAuthPending(true);setOAuthError('');try{const response=await fetch('/api/auth/openai',{method:'POST'});const payload:unknown=await response.json();if(!response.ok)throw new Error(z.object({error:z.string()}).parse(payload).error);window.location.assign(z.object({authorizationUrl:z.string().url()}).parse(payload).authorizationUrl);}catch(error){setOAuthError(error instanceof Error?error.message:'Could not start OpenAI sign-in.');setOAuthPending(false);}}}/>{oauthStatus?.connected&&<Button label="Disconnect" size="sm" onClick={async()=>{const response=await fetch('/api/auth/openai',{method:'DELETE'});if(response.ok){setOAuthStatus({...oauthStatus,connected:false,email:null,canUsePlan:false,scopes:[],expiresAt:null});setOAuthModels([]);}else setOAuthError('Could not revoke the OpenAI session.');}}/>}</HStack>{oauthError&&<Text role="alert">{oauthError}</Text>}<Text type="supporting" color="secondary">OpenAI OAuth uses Authorization Code with PKCE. Tokens remain in private server storage.</Text><Button label="Use for outreach" size="sm" isDisabled={outreachPending} onClick={async()=>{setOutreachPending(true);try{const response=await fetch('/api/agents/model-settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(settings)});const result=await response.json();if(!response.ok)throw new Error(result.error);setOutreachStatus(`Connected: ${result.provider} / ${result.model}`);}catch(error){setOutreachStatus(error instanceof Error?error.message:'Connection failed');}finally{setOutreachPending(false);}}}/>{outreachStatus&&<Text role="status">{outreachStatus}</Text>}</VStack></Card></VStack>}
      {section==='Connected apps'&&<VStack gap={4}><OutreachOperationsPanel/></VStack>}
      {section==='Privacy'&&<Card padding={4}><VStack gap={4}><Heading level={2}>Privacy</Heading><Text>API credentials are encrypted by CTX and are never included in model prompts or browser responses.</Text><Text>CRM values are treated as sourced data. They do not grant outreach permission or eligibility.</Text></VStack></Card>}
      {section==='Notifications'&&<NotificationSettings/>}
    </VStack></VStack></LayoutContent>}/>;
}

function SettingsInfoRow({label,value}:{label:string;value:string}) {
  return <><HStack hAlign="between" vAlign="start"><VStack gap={1}><Text type="body" weight="semibold" display="block">{label}</Text><Text type="supporting" color="secondary" display="block">{value}</Text></VStack></HStack><Divider/></>;
}
