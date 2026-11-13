import { NextRequest } from 'next/server';
import { z } from 'zod';
import { hasLocalWorkspaceAccess } from '@/lib/server/local-workspace-auth';
import { senderCredentialsSchema,testSenderConnection } from '@/lib/server/outreach/credentials';
import { saveSenderConfig,senderStatus } from '@/lib/server/outreach/sender-config';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){if(!hasLocalWorkspaceAccess(request))return Response.json({error:'Operator access required.'},{status:401});return Response.json(senderStatus(),{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:NextRequest){
  if(!hasLocalWorkspaceAccess(request))return Response.json({error:'Operator access required.'},{status:401});
  if(request.headers.get('origin')!==request.nextUrl.origin&&request.headers.get('sec-fetch-site')!=='same-origin')return Response.json({error:'Same-origin request required.'},{status:403});
  const raw=await request.text();if(raw.length>4096)return Response.json({error:'Request too large.'},{status:413});
  let value:unknown;try{value=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON.'},{status:400});}
  const parsed=z.object({credentials:senderCredentialsSchema,liveDelivery:z.boolean()}).strict().safeParse(value);
  if(!parsed.success)return Response.json({error:'Check sender fields and app password.'},{status:400});
  const checks=await testSenderConnection(parsed.data.credentials);
  if(!checks.smtp||!checks.imap)return Response.json({error:'Both connection checks must pass before saving.',...checks},{status:422});
  try{await saveSenderConfig(parsed.data.credentials,parsed.data.liveDelivery);return Response.json({saved:true,...checks,...senderStatus(),restartWorker:!process.env.CTX_SETTINGS_KEY&&!process.env.CTX_SETTINGS_KEY_FILE},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Could not save sender configuration. Check file access or a concurrent save.'},{status:409});}
}
