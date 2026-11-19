import {NextRequest} from "next/server";
import {hasLocalWorkspaceAccess} from "@/lib/server/local-workspace-auth";
import {outreachStore} from "@/lib/server/outreach/store-instance";
import {notificationSnapshot,saveNotificationPreferences,markNotificationRead,NotificationConflict} from "@/lib/server/operator-notifications";
import {z} from "zod";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(request:NextRequest){
 if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required."},{status:401,headers});
 return Response.json(notificationSnapshot(outreachStore()),{headers});
}
export async function PUT(request:NextRequest){
 if(!hasLocalWorkspaceAccess(request))return Response.json({error:"Operator access required."},{status:401,headers});
 if(request.headers.get("origin")!==request.nextUrl.origin&&request.headers.get("sec-fetch-site")!=="same-origin")return Response.json({error:"Same-origin request required."},{status:403,headers});
 const raw=await request.text();if(Buffer.byteLength(raw)>8000)return Response.json({error:"Request too large."},{status:413,headers});
 try{
   const value:unknown=JSON.parse(raw);
   const read=z.object({read:z.string().max(200)}).strict().safeParse(value);
   if(read.success){markNotificationRead(outreachStore(),read.data.read);return Response.json({saved:true},{headers});}
   return Response.json(saveNotificationPreferences(outreachStore(),value),{headers});
 }catch(error){return Response.json({error:error instanceof NotificationConflict?error.message:"Invalid notification settings."},{status:error instanceof NotificationConflict?409:400,headers});}
}
