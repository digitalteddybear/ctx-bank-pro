import { NextRequest } from "next/server";
import { z } from "zod";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
import { saveProviderKey } from "@/lib/server/outreach/runtime-settings";
export async function POST(request:NextRequest){
  if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required."},{status:401});
  if(request.headers.get("origin")!==request.nextUrl.origin&&request.headers.get("sec-fetch-site")!=="same-origin")return Response.json({error:"Same-origin request required."},{status:403});
  const input=z.object({provider:z.enum(["openai","openrouter","anthropic","openai-compatible","hubspot","cal"]),value:z.string().trim().min(8).max(10000)}).strict().safeParse(await request.json().catch(()=>null));
  if(!input.success)return Response.json({error:"Choose a provider and enter its API key."},{status:400});
  try{saveProviderKey(input.data.provider,input.data.value);return Response.json({saved:true});}
  catch{return Response.json({error:"API key was not saved. Check the deployment encryption key."},{status:503});}
}
