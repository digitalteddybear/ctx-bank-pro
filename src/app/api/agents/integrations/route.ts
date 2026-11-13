import { NextRequest } from "next/server";
import { z } from "zod";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
import { outreachStore } from "@/lib/server/outreach/store-instance";
import { loadProviderKeys, loadIntegrationSettings } from "@/lib/server/outreach/runtime-settings";
const schema=z.object({hubspotWrites:z.boolean(),calEventTypeId:z.string().regex(/^(?:[1-9]\d*)?$/)}).strict();
export async function GET(request:NextRequest){
  if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required."},{status:401});
  loadProviderKeys();loadIntegrationSettings();
  return Response.json({hubspotWrites:process.env.HUBSPOT_WRITES_ENABLED==="true",calEventTypeId:process.env.CAL_EVENT_TYPE_ID??"",hubspotConfigured:Boolean(process.env.HUBSPOT_ACCESS_TOKEN),calConfigured:Boolean(process.env.CAL_API_KEY)});
}
export async function POST(request:NextRequest){
  if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required."},{status:401});
  if(request.headers.get("origin")!==request.nextUrl.origin&&request.headers.get("sec-fetch-site")!=="same-origin")return Response.json({error:"Same-origin request required."},{status:403});
  const result=schema.safeParse(await request.json().catch(()=>null));
  if(!result.success)return Response.json({error:"Check integration settings."},{status:400});
  loadProviderKeys();
  if(result.data.hubspotWrites&&!process.env.HUBSPOT_ACCESS_TOKEN)return Response.json({error:"Add the HubSpot key before enabling writes."},{status:422});
  outreachStore().setSetting("integration-settings",JSON.stringify(result.data));
  loadIntegrationSettings();
  outreachStore().event("operations","integration_settings_saved",result.data);
  return Response.json({saved:true});
}
