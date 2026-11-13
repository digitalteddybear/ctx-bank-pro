import { indexCrmContext } from "@/lib/server/integrations/hubspot-index";
import { NextRequest } from "next/server";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
import { hubspotContext } from "@/lib/server/integrations/hubspot-lead-context";
import { syncPhase1 } from "@/lib/server/integrations/hubspot-context";
import { loadLeadGraph } from "@/lib/server/lead-corpus";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(request:NextRequest) {
  if(!hasLocalWorkspaceAccess(request)) return Response.json({error:"Unauthorized"},{status:401,headers});
  const ctx=hubspotContext(), id=request.nextUrl.searchParams.get("id");
  return Response.json(id ? {contact:ctx.contact(id),proposals:ctx.store.db.prepare("SELECT data FROM crm_proposals WHERE contact_id=?").all(id).map(r=>JSON.parse(String(r.data)) as unknown)} : {registry:ctx.registry(),contacts:ctx.snapshots().map(c=>({hubspotId:c.hubspotId,revision:c.revision,indexState:ctx.contact(c.hubspotId)?.indexState})),writesEnabled:false},{headers});
}
export async function POST(request:NextRequest) {
  if(!hasLocalWorkspaceAccess(request)) return Response.json({error:"Unauthorized"},{status:401,headers});
  try {
    const body=z.discriminatedUnion("action",[z.object({action:z.literal("sync")}).strict(),z.object({action:z.literal("propose"),proposal:z.unknown()}).strict()]).parse(await request.json());
    const ctx=hubspotContext();
    if(body.action==="propose") return Response.json(ctx.propose(body.proposal),{headers});
    const graph=await loadLeadGraph();
    const canonical=new Map(graph.nodes.filter(n=>n.id.startsWith("lead-")).map(n=>[n.id.slice(5),n.sources[0]?.excerpt?.match(/^- \*\*Raw Email:\*\*\s*(\S+)/m)?.[1] ?? ""]));
    const result=await syncPhase1(ctx,canonical);
    const indexing=await indexCrmContext();
    return Response.json({...result,indexing},{headers});
  } catch(error) { return Response.json({error:error instanceof z.ZodError ? "Invalid request" : error instanceof Error ? error.message : "CRM context operation failed"},{status:400,headers}); }
}
