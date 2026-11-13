import { NextRequest } from "next/server";
import { z } from "zod";
import { aiWorkspaceStore, AIWorkspaceError } from "@/lib/server/ai-workspace-store";
import { ArtifactPreviewError, compileArtifactPreview } from "@/lib/server/ai-artifact-preview";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.object({artifactId:z.string().uuid(),version:z.number().int().positive().optional()}).strict();
export async function POST(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({error:"Local workspace access required."},{status:401});
  try {
    const raw = await request.text(); if (raw.length > 1000) return Response.json({error:"Invalid preview request."},{status:413});
    let body:unknown; try { body=JSON.parse(raw); } catch { return Response.json({error:"Invalid JSON."},{status:400}); }
    const parsed = input.safeParse(body); if (!parsed.success) return Response.json({error:"Invalid preview request."},{status:400});
    const artifact = aiWorkspaceStore().getArtifact(parsed.data.artifactId, parsed.data.version);
    if (!artifact) return Response.json({error:"Artifact not found."},{status:404});
    const preview = await compileArtifactPreview(artifact);
    return Response.json(preview,{headers:{"Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; frame-ancestors 'self'"}});
  } catch (error) { return Response.json({error:error instanceof Error?error.message:"Preview could not be built."},{status:error instanceof ArtifactPreviewError?error.status:error instanceof AIWorkspaceError?error.status:500,headers:{"Cache-Control":"no-store"}}); }
}
