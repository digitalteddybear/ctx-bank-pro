// Read-only service checks. Writes only a timestamped report; never fixes settings.
import fs from 'node:fs';
import {testSenderConnection} from '../src/lib/server/outreach/credentials.ts';
import {outreachStore} from '../src/lib/server/outreach/store-instance.ts';
import {usableSources,usableDeliverabilitySources} from '../src/lib/server/outreach/sources.ts';
import {openAIChatGPTOAuthStatus} from '../src/lib/server/openai-chatgpt-oauth.ts';
const store=outreachStore();const report={checkedAt:new Date().toISOString(),mode:'verify-only',checks:{}};
const check=async(name,fn)=>{try{report.checks[name]=await fn();}catch{report.checks[name]={ok:false,error:'Check failed; configuration was not modified.'};}};
await Promise.all([
check('sender',()=>testSenderConnection({senderName:process.env.CTX_SENDER_NAME||'Dylan',email:process.env.GMAIL_USER||'',password:(process.env.GMAIL_APP_PASSWORD||'').replace(/\s/g,'')})),
check('model',async()=>{const s=await openAIChatGPTOAuthStatus();return {ok:s.connected&&s.canUsePlan,configured:Boolean(store.setting('lead-outreach-settings'))};}),
check('hubspot',async()=>{const r=await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(process.env.HUBSPOT_TEST_CONTACT_ID||'')}?properties=email`,{headers:{Authorization:`Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`},signal:AbortSignal.timeout(15000)});const b=await r.json();return {ok:r.ok&&b.properties?.email?.toLowerCase()===process.env.HUBSPOT_TEST_CONTACT_EMAIL?.toLowerCase(),http:r.status,writesEnabled:process.env.HUBSPOT_WRITES_ENABLED==='true',writeCapability:'Not exercised by read-only preflight'};}),
check('calendar',async()=>{const r=await fetch('https://api.cal.com/v2/calendars',{headers:{Authorization:`Bearer ${process.env.CAL_API_KEY}`},signal:AbortSignal.timeout(15000)});const b=await r.json();const d=b.data?.destinationCalendar;return {ok:r.ok&&d?.integration==='google_calendar'&&b.data?.connectedCalendars?.some(c=>c.integration?.type==='google_calendar'&&c.calendars?.some(x=>x.isSelected&&x.externalId===d.externalId)),eventTypeId:process.env.CAL_EVENT_TYPE_ID,webhookConfigured:Boolean(process.env.CAL_WEBHOOK_SECRET)};})
]);
for(const [name,fn] of [['regulatorySources',usableSources],['deliverabilitySources',usableDeliverabilitySources]]){try{report.checks[name]={ok:true,count:fn(store,'live').length};}catch{report.checks[name]={ok:false,error:'Required sources include missing, changed, stale, unreviewed or fixture records.'};}}
report.checks.dispatch={enabled:process.env.CTX_LIVE_EMAIL_DISPATCH==='true'};
report.checks.companyPolicies={ok:['asp-policy','asp-privacy-policy','asp-terms-conditions','asp-qualification','asp-cookies-policy'].every(id=>store.sourceList().some(s=>s.id===id&&!s.fixture&&s.approvedBy&&!s.changed))};
fs.mkdirSync('task-logs',{recursive:true});fs.writeFileSync('task-logs/outreach-preflight-latest.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
