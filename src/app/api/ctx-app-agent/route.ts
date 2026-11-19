import { NextRequest, NextResponse } from 'next/server';
import { CtxAgentError, ctxAgentProviderStatus, runCtxAppAgent } from '@/lib/server/ctx-app-agent';
import { hasLocalWorkspaceAccess } from '@/lib/server/local-workspace-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameOrigin(request:NextRequest) {
  return request.headers.get('sec-fetch-site')==='same-origin' || request.headers.get('origin')===request.nextUrl.origin;
}

export async function GET(request:NextRequest) {
  if(!sameOrigin(request) || !hasLocalWorkspaceAccess(request)) return NextResponse.json({error:'Local same-origin access required.'},{status:403});
  return NextResponse.json(await ctxAgentProviderStatus(),{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:NextRequest) {
  if(!sameOrigin(request) || !hasLocalWorkspaceAccess(request)) return NextResponse.json({error:'Local same-origin access required.'},{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({error:'JSON required.'},{status:415});
  try {
    const raw=await request.text();
    if(raw.length>180000) return NextResponse.json({error:'Request exceeds the 180 KB limit.'},{status:413});
    let body:unknown;
    try { body=JSON.parse(raw); } catch { return NextResponse.json({error:'Invalid JSON.'},{status:400}); }
    return NextResponse.json(await runCtxAppAgent(body),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const status=error instanceof CtxAgentError?error.status:500;
    const message=error instanceof CtxAgentError?error.message:'CTX App Agent could not complete this request.';
    return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
  }
}
