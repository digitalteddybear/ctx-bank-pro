import { NextRequest } from "next/server";
import { z } from "zod";
import { AIWorkspaceError, aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const titleSchema = z.object({ title: z.string().trim().min(1).max(200) }).strict();
export async function GET(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  const { id } = await context.params; const conversation = aiWorkspaceStore().getConversation(id);
  return conversation ? Response.json({ conversation }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Chat not found." }, { status: 404 });
}
export async function PATCH(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  try {
    const parsed = titleSchema.safeParse(await request.json() as unknown);
    if (!parsed.success) return Response.json({ error: "Invalid chat title." }, { status: 400 });
    const { id } = await context.params; const store = aiWorkspaceStore(); const current = store.getConversation(id);
    if (!current) return Response.json({ error: "Chat not found." }, { status: 404 });
    const meta = store.updateConversationTitle(id, parsed.data.title);
    return Response.json({ conversation: meta }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Chat could not be updated." }, { status: error instanceof AIWorkspaceError ? error.status : 400 }); }
}
export async function DELETE(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  try { const { id } = await context.params; aiWorkspaceStore().deleteConversation(id); return Response.json({ deleted: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Chat could not be deleted." }, { status: error instanceof AIWorkspaceError ? error.status : 500 }); }
}
