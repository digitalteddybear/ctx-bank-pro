import { NextRequest, NextResponse } from 'next/server';
import { finishOpenAIChatGPTOAuth, OpenAIOAuthError } from '@/lib/server/openai-chatgpt-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await finishOpenAIChatGPTOAuth(request.nextUrl);
    return NextResponse.redirect(new URL('/?view=ai-settings&openai_oauth=connected', request.nextUrl.origin), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const stage = error instanceof OpenAIOAuthError ? error.stage : 'callback';
    console.error('[OpenAI OAuth] callback failed at stage:', stage);
    return NextResponse.redirect(new URL(`/?view=ai-settings&openai_oauth=error&reason=${stage}`, request.nextUrl.origin), { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
}
