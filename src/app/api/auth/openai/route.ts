import { NextRequest, NextResponse } from 'next/server';
import { beginOpenAIChatGPTOAuth, openAIChatGPTModels, openAIChatGPTOAuthStatus, removeOpenAIChatGPTCredentials } from '@/lib/server/openai-chatgpt-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isLocal(request: NextRequest) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(request.nextUrl.hostname);
}
function sameOrigin(request: NextRequest) {
  return isLocal(request) && (request.headers.get('sec-fetch-site') === 'same-origin' || request.headers.get('origin') === request.nextUrl.origin);
}

export async function GET(request: NextRequest) {
  if (!isLocal(request)) return NextResponse.json({ error: 'OpenAI account linking is available from the local CTX app only.' }, { status: 403 });
  try {
    if (request.nextUrl.searchParams.get('resource') === 'models') return NextResponse.json({ models: await openAIChatGPTModels() }, { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(await openAIChatGPTOAuthStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read the OpenAI account.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Start OpenAI sign-in from the local CTX app.' }, { status: 403 });
  if (request.nextUrl.protocol !== 'http:') return NextResponse.json({ error: 'OpenAI local account linking requires the CTX app to use HTTP on loopback.' }, { status: 400 });
  try {
    const port = request.nextUrl.port || '80';
    const callbackUri = `http://127.0.0.1:${port}/api/auth/openai/callback`;
    const authorizationUrl = await beginOpenAIChatGPTOAuth(callbackUri);
    return NextResponse.json({ authorizationUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start OpenAI sign-in.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Disconnect from the local CTX app.' }, { status: 403 });
  try {
    await removeOpenAIChatGPTCredentials();
    return NextResponse.json({ connected: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not remove the local OpenAI credentials.' }, { status: 500 });
  }
}
