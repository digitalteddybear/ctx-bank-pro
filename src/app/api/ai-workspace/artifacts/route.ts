import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createArtifactInputSchema } from "@/lib/ai-workspace-contract";
import { AIWorkspaceError, aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (!conversationId) return Response.json({ error: "conversationId is required." }, { status: 400 });
  return Response.json({ artifacts: aiWorkspaceStore().listArtifacts(conversationId) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required." }, { status: 415 });
  try {
    const raw = await request.text(); if (raw.length > 1_500_000) return Response.json({ error: "Artifact exceeds the 1.5 MB limit." }, { status: 413 });
    const parsed = createArtifactInputSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return Response.json({ error: "Invalid artifact." }, { status: 400 });
    const data = parsed.data; const id = randomUUID();
    const artifact = aiWorkspaceStore().createArtifact({ id, conversationId: data.conversationId, title: data.title, type: data.type, status: "ready", version: { artifactId: id, version: 1, files: data.files ?? [], ...(data.spec ? { spec: data.spec } : {}), sourceReferences: data.sourceReferences, provenance: data.provenance, createdAt: new Date().toISOString() } });
    return Response.json({ artifact }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Artifact could not be created." }, { status: error instanceof AIWorkspaceError ? error.status : 400 }); }
}
