import { NextRequest } from "next/server";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
import { outreachStore } from "@/lib/server/outreach/store-instance";
import { readAISettings, saveAISettings, SettingsConflict } from "@/lib/server/ai-settings-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"no-store"};
export async function GET(request:NextRequest) {
  if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required."},{status:401,headers});
  return Response.json(readAISettings(outreachStore()),{headers});
}
export async function PUT(request:NextRequest) {
  if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required."},{status:401,headers});
  if(request.headers.get("origin")!==request.nextUrl.origin&&request.headers.get("sec-fetch-site")!=="same-origin")
    return Response.json({error:"Same-origin request required."},{status:403,headers});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>16000)return Response.json({error:"Settings exceed the size limit."},{status:413,headers});
  try{return Response.json(saveAISettings(outreachStore(),JSON.parse(raw)),{headers});}
  catch(error){return Response.json({error:error instanceof SettingsConflict?error.message:"Invalid AI settings."},{status:error instanceof SettingsConflict?409:400,headers});}
}
