import { NextRequest } from "next/server";
import { z } from "zod";
import { aiWorkspaceConversationSchema } from "@/lib/ai-workspace-contract";
import { aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const importSchema = z.object({ conversations: z.array(aiWorkspaceConversationSchema).max(100) }).strict();
export async function POST(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required." }, { status: 415 });
  try {
    const raw = await request.text();
    if (raw.length > 20_000_000) return Response.json({ error: "Workspace import exceeds the 20 MB limit." }, { status: 413 });
    const parsed = importSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return Response.json({ error: "Invalid workspace import." }, { status: 400 });
    return Response.json(aiWorkspaceStore().importConversations(parsed.data.conversations), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Workspace import could not be read." }, { status: 400 }); }
}
