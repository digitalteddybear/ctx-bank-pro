import { NextRequest } from "next/server";
import { aiWorkspaceMessageSchema } from "@/lib/ai-workspace-contract";
import { AIWorkspaceError, aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; messageId: string }> };
const patchSchema = aiWorkspaceMessageSchema.partial().strict();
export async function PATCH(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required." }, { status: 415 });
  try {
    const raw = await request.text(); if (raw.length > 2_000_000) return Response.json({ error: "Message exceeds the 2 MB limit." }, { status: 413 });
    const parsed = patchSchema.safeParse(JSON.parse(raw) as unknown); if (!parsed.success) return Response.json({ error: "Invalid message update." }, { status: 400 });
    const { id, messageId } = await context.params;
    return Response.json({ message: aiWorkspaceStore().updateMessage(id, messageId, parsed.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Message could not be updated." }, { status: error instanceof AIWorkspaceError ? error.status : 400 }); }
}
