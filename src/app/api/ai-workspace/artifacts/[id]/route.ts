import { NextRequest } from "next/server";
import { updateArtifactInputSchema } from "@/lib/ai-workspace-contract";
import { AIWorkspaceError, aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  const { id } = await context.params; const rawVersion = request.nextUrl.searchParams.get("version");
  const version = rawVersion === null ? undefined : Number(rawVersion);
  if (rawVersion !== null && (!Number.isInteger(version) || (version ?? 0) < 1)) return Response.json({ error: "Invalid artifact version." }, { status: 400 });
  try { const artifact = aiWorkspaceStore().getArtifact(id, version); return artifact ? Response.json({ artifact }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Artifact not found." }, { status: 404 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Artifact could not be loaded." }, { status: error instanceof AIWorkspaceError ? error.status : 500 }); }
}
export async function PATCH(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required." }, { status: 415 });
  try {
    const raw = await request.text(); if (raw.length > 1_500_000) return Response.json({ error: "Artifact exceeds the 1.5 MB limit." }, { status: 413 });
    const parsed = updateArtifactInputSchema.safeParse(JSON.parse(raw) as unknown); if (!parsed.success) return Response.json({ error: "Invalid artifact update." }, { status: 400 });
    const { id } = await context.params; const { baseVersion, ...change } = parsed.data;
    const artifact = aiWorkspaceStore().updateArtifact(id, baseVersion, change);
    return Response.json({ artifact }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Artifact could not be updated." }, { status: error instanceof AIWorkspaceError ? error.status : 400 }); }
}
export async function DELETE(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  try { const { id } = await context.params; aiWorkspaceStore().archiveArtifact(id); return Response.json({ archived: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Artifact could not be archived." }, { status: error instanceof AIWorkspaceError ? error.status : 500 }); }
}
