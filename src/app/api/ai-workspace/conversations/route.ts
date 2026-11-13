import { NextRequest } from "next/server";
import { aiWorkspaceConversationSchema } from "@/lib/ai-workspace-contract";
import { AIWorkspaceError, aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  return Response.json({ conversations: aiWorkspaceStore().listConversations() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required." }, { status: 415 });
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return Response.json({ error: "Conversation exceeds the 2 MB limit." }, { status: 413 });
    const parsed = aiWorkspaceConversationSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return Response.json({ error: "Invalid conversation." }, { status: 400 });
    return Response.json({ conversation: aiWorkspaceStore().createConversation(parsed.data) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AIWorkspaceError ? error.status : 400; return Response.json({ error: error instanceof Error ? error.message : "Conversation could not be saved." }, { status }); }
}
