import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { generativeWidgetPayloadSchema } from "@/lib/ctx-app-agent-contract";
import { createArtifactInputSchema, updateArtifactInputSchema } from "@/lib/ai-workspace-contract";
import { AIWorkspaceError, aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { ArtifactPreviewError, compileArtifactPreview } from "@/lib/server/ai-artifact-preview";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestSchema = z.discriminatedUnion("name",[
  z.object({name:z.literal("create_artifact"),input:z.unknown()}).strict(),
  z.object({name:z.literal("read_artifact"),input:z.object({artifactId:z.string().uuid(),version:z.number().int().positive().optional()}).strict()}).strict(),
  z.object({name:z.literal("update_artifact"),input:z.object({artifactId:z.string().uuid(),change:updateArtifactInputSchema}).strict()}).strict(),
  z.object({name:z.literal("render_component"),input:z.object({component:generativeWidgetPayloadSchema}).strict()}).strict(),
  z.object({name:z.literal("get_preview_diagnostics"),input:z.object({artifactId:z.string().uuid(),version:z.number().int().positive().optional()}).strict()}).strict(),
]);
export async function POST(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({error:"Local workspace access required."},{status:401});
  try {
    const raw=await request.text(); if(raw.length>1_600_000)return Response.json({error:"Tool request exceeds the 1.6 MB limit."},{status:413});
    let body:unknown; try{body=JSON.parse(raw);}catch{return Response.json({error:"Invalid JSON."},{status:400});}
    const parsed=requestSchema.safeParse(body); if(!parsed.success)return Response.json({error:"Invalid tool request."},{status:400});
    const store=aiWorkspaceStore();
    switch(parsed.data.name){
      case "create_artifact": {
        const payload=createArtifactInputSchema.safeParse(parsed.data.input); if(!payload.success)return Response.json({error:"Invalid artifact input."},{status:400});
        const input=payload.data; const conversation=store.getConversation(input.conversationId); if(!conversation)return Response.json({error:"Chat not found."},{status:404});
        const id=randomUUID(); const artifact=store.createArtifact({id,conversationId:input.conversationId,title:input.title,type:input.type,status:"ready",version:{artifactId:id,version:1,files:input.files??[],...(input.spec?{spec:input.spec}:{}),sourceReferences:input.sourceReferences,provenance:input.provenance,createdAt:new Date().toISOString()}});
        return Response.json({ok:true,artifact},{status:201,headers:{"Cache-Control":"no-store"}});
      }
      case "read_artifact": {
        const artifact=store.getArtifact(parsed.data.input.artifactId,parsed.data.input.version); return artifact?Response.json({ok:true,artifact},{headers:{"Cache-Control":"no-store"}}):Response.json({error:"Artifact not found."},{status:404});
      }
      case "update_artifact": {
        const {artifactId,change}=parsed.data.input; const {baseVersion,...updates}=change; const artifact=store.updateArtifact(artifactId,baseVersion,updates); return Response.json({ok:true,artifact},{headers:{"Cache-Control":"no-store"}});
      }
      case "render_component": return Response.json({ok:true,component:generativeWidgetPayloadSchema.parse(parsed.data.input.component)});
      case "get_preview_diagnostics": {
        const artifact=store.getArtifact(parsed.data.input.artifactId,parsed.data.input.version); if(!artifact)return Response.json({error:"Artifact not found."},{status:404});
        const preview=await compileArtifactPreview(artifact); return Response.json({ok:true,diagnostics:preview.diagnostics,sourceVersion:preview.sourceVersion});
      }
    }
  } catch(error) { return Response.json({error:error instanceof Error?error.message:"Workspace tool failed."},{status:error instanceof AIWorkspaceError||error instanceof ArtifactPreviewError?error.status:400}); }
}
