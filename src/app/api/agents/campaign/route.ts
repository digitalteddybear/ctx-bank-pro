import { readDemoPreferences, saveDemoPreferences } from "@/lib/server/outreach/demo-preferences";
import { renderReplyHtml } from '@/lib/server/outreach/transport/reply-html';
import { readReplyTemplate, saveReplyTemplate, templateScope } from '@/lib/server/outreach/reply-template-store';
import { NextRequest } from 'next/server';
import { hasLocalWorkspaceAccess } from '@/lib/server/local-workspace-auth';
import { CampaignRegistry } from '@/lib/server/outreach/campaigns';
import { outreachStore } from '@/lib/server/outreach/runtime';
import { campaignInputSchema, campaignControlSchema, campaignSegmentSchema } from '@/lib/outreach-campaign-contract';
import { z } from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  if(!hasLocalWorkspaceAccess(request))return Response.json({error:'Operator access required.'},{status:401});
  if(request.nextUrl.searchParams.get('preferencesScope')==='demo')return Response.json(readDemoPreferences(outreachStore()),{headers:{'Cache-Control':'no-store'}});
  const scope=request.nextUrl.searchParams.get('templateScope');
  if(scope){const parsed=templateScope.safeParse(scope);if(!parsed.success)return Response.json({error:'Invalid template scope.'},{status:400});return Response.json(readReplyTemplate(outreachStore(),parsed.data),{headers:{'Cache-Control':'no-store'}});}
  const registry=new CampaignRegistry(outreachStore());
  const segment=campaignSegmentSchema.safeParse(request.nextUrl.searchParams.get('segment')??'all');
  if(!segment.success)return Response.json({error:'Invalid cohort.'},{status:400});
  return Response.json({...await registry.overview(),preferences:registry.preferences(),templateContacts:await registry.templateContacts(segment.data)},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:NextRequest){
  if(!hasLocalWorkspaceAccess(request))return Response.json({error:'Operator access required.'},{status:401});
  if(request.headers.get('origin')!==request.nextUrl.origin&&request.headers.get('sec-fetch-site')!=='same-origin')return Response.json({error:'Same-origin request required.'},{status:403});
  const raw=await request.text();if(raw.length>256000)return Response.json({error:'Request too large.'},{status:413});
  let value:unknown;try{value=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON.'},{status:400});}
  if(value && typeof value==='object' && 'action' in value && value.action==='preview-reply-template'){
    const parsed=z.object({action:z.literal('preview-reply-template'),template:z.string().max(20000),message:z.string().max(12000).optional()}).strict().safeParse(value);
    if(!parsed.success)return Response.json({error:'Invalid template.'},{status:400});
    try{
      const template=parsed.data.template;
      const missingMessage=Boolean(template.trim())&&!/\{\{\s*(?:message|body|reply)\s*\}\}/i.test(template);
      const html=missingMessage
        ? renderReplyHtml('',template+'{{message}}')
        : renderReplyHtml(parsed.data.message ?? 'Thank you for your note. I would be pleased to help arrange an introductory conversation.\n\nBest regards,\nDylan\nASP Private Capital',template);
      return Response.json({html:html??'',warning:missingMessage?'Add {{message}} where the reply text belongs before saving.':''});
    }
    catch{return Response.json({error:'Reply HTML must include {{message}}.'},{status:400});}
  }
  if(value && typeof value==='object' && 'action' in value && value.action==='save-reply-template'){
    const parsed=z.object({action:z.literal('save-reply-template'),template:z.string().max(20000),scope:templateScope.default('demo')}).strict().safeParse(value);
    if(!parsed.success)return Response.json({error:'Invalid reply template.'},{status:400});
    try{return Response.json({saved:true,...saveReplyTemplate(outreachStore(),parsed.data.scope,parsed.data.template)},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Reply HTML must include {{message}}.'},{status:400});}
  }
  if(value && typeof value==='object' && 'action' in value && value.action==='save-demo-preferences'){
    const parsed=z.object({action:z.literal('save-demo-preferences'),preferences:z.unknown()}).strict().safeParse(value);
    if(!parsed.success)return Response.json({error:'Invalid demo settings.'},{status:400});
    try{return Response.json({saved:true,...saveDemoPreferences(outreachStore(),parsed.data.preferences)},{headers:{'Cache-Control':'no-store'}});}
    catch{return Response.json({error:'Invalid demo settings. Reply HTML must include {{message}}.'},{status:400});}
  }
  if(value && typeof value==='object' && 'action' in value && value.action==='save-preferences'){
    try{return Response.json({preferences:new CampaignRegistry(outreachStore()).savePreferences((value as unknown as {preferences:unknown}).preferences)},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Invalid campaign preferences.'},{status:400});}
  }
  if(value && typeof value==='object' && 'action' in value && value.action==='preview-template'){
    try{
      const input=z.object({action:z.literal('preview-template'),segment:campaignSegmentSchema,leadId:z.string().min(1).max(100),template:z.string().max(8000)}).strict().parse(value);
      return Response.json(await new CampaignRegistry(outreachStore()).previewTemplate(input.segment,input.leadId,input.template),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({error:error instanceof Error?error.message:'Template preview failed.'},{status:400});}
  }
  const control=campaignControlSchema.safeParse(value);
  if(control.success){try{return Response.json({batch:new CampaignRegistry(outreachStore()).control(control.data.id,control.data.action)},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Batch not found.'},{status:404});}}
  const parsed=campaignInputSchema.safeParse(value);if(!parsed.success)return Response.json({error:'Invalid batch settings.'},{status:400});
  try{return Response.json({batch:await new CampaignRegistry(outreachStore()).start(parsed.data)},{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Could not prepare batch.'},{status:409});}
}
