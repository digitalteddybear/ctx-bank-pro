import { NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { restoreArtifactInputSchema } from "@/lib/ai-workspace-contract";
import { AIWorkspaceError, aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  try {
    const parsed = restoreArtifactInputSchema.safeParse(await request.json() as unknown); if (!parsed.success) return Response.json({ error: "Invalid restore request." }, { status: 400 });
    const { id } = await context.params;
    const artifact = aiWorkspaceStore().getArtifact(id, parsed.data.version);
    if (!artifact?.version) return Response.json({ error: "Artifact version not found." }, { status: 404 });
    const version = aiWorkspaceStore().restoreArtifact(id, parsed.data.version, { provider: "local-workspace", model: "restore", runId: `restore-${randomUUID()}`, createdAt: new Date().toISOString(), promptHash: createHash("sha256").update(`restore:${id}:${parsed.data.version}`).digest("hex") });
    return Response.json({ artifact: version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Artifact could not be restored." }, { status: error instanceof AIWorkspaceError ? error.status : 400 }); }
}
