import {NextRequest} from "next/server";
import {aiSettingsSchema} from "@/lib/ai-settings";
import {hasLocalWorkspaceAccess} from "@/lib/server/local-workspace-auth";
import {outreachStore} from "@/lib/server/outreach/store-instance";
import {requestOutreachModel} from "@/lib/server/ctx-app-agent";
export async function GET(request:NextRequest){if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required"},{status:401});const raw=outreachStore().setting("lead-outreach-settings");return Response.json({settings:raw?JSON.parse(String(raw)):null});}
export async function POST(request:NextRequest){
 if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required"},{status:401});
 try{const settings=aiSettingsSchema.parse(await request.json());
 const check=await requestOutreachModel(settings,'Return exactly {"ready":true}. This is a connection check; no tools or external actions.',{});
 if(JSON.parse(check.text).ready!==true)throw new Error("Model did not return the expected response.");
 outreachStore().setSetting("lead-outreach-settings",JSON.stringify(settings));
 outreachStore().event("operations","outreach_model_configured",{provider:check.provider,model:check.model});
 return Response.json({ok:true,provider:check.provider,model:check.model});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Model configuration failed"},{status:400});}
}
