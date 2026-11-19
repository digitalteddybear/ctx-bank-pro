import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createGuestSession, createOperatorSession, sessionCookie, verifyOperatorPassword, workspaceSessionRole } from "@/lib/server/operator-session";
import { adminEmail, createInitialAdminProfile, hasAdminProfile, setupMode, verifyBootstrapPasskey } from "@/lib/server/ctx-profile-store";
import { outreachStore } from "@/lib/server/outreach/store-instance";

export const runtime="nodejs";
export async function GET(request:NextRequest){
  const loginRequired=true;
  const role=await workspaceSessionRole(request);
  const rawEmail = role==="administrator" ? adminEmail() : "";
  const localPart = rawEmail.split("@")[0]?.split(/[._-]/)[0] ?? "";
  const profileName = localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : null;
  return NextResponse.json({loginRequired,setupRequired:!hasAdminProfile(),setupMode:setupMode(),authenticated:role!==null,role:role,...(role==="administrator"?{profileName,themePreference:outreachStore().setting("administrator-theme")??null}:{})},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:NextRequest){
  if(request.headers.get("origin")!==request.nextUrl.origin&&request.headers.get("sec-fetch-site")!=="same-origin")
    return NextResponse.json({error:"Same-origin request required."},{status:403});
  const raw=await request.json().catch(()=>null);
  const setupInput=z.object({profile:z.literal("setup"),email:z.string().email(),passkey:z.string().min(12).max(256)}).strict().safeParse(raw);
  if(setupInput.success){
    const configuredEmail=adminEmail();
    if(configuredEmail&&setupInput.data.email.trim().toLowerCase()!==configuredEmail.toLowerCase())return NextResponse.json({error:"Use the administrator email configured for this CTX deployment."},{status:409});
    const localHosts=new Set(["localhost","127.0.0.1","::1","[::1]"]);
    if(setupMode()==="bootstrap"){
      if(!verifyBootstrapPasskey(setupInput.data.passkey))return NextResponse.json({error:"The configured setup passkey is incorrect."},{status:401});
    }else if(!localHosts.has(request.nextUrl.hostname))return NextResponse.json({error:"First administrator setup must be completed from the CTX host."},{status:403});
    if(hasAdminProfile())return NextResponse.json({error:"The administrator profile is already configured."},{status:409});
    try{
      createInitialAdminProfile(setupInput.data.email,setupInput.data.passkey);
      const token=await createOperatorSession(setupInput.data.email.trim().toLowerCase());
      const response=NextResponse.json({ok:true,role:"administrator"});
      response.cookies.set(sessionCookie,token,{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/",maxAge:8*3600});
      return response;
    }catch(cause){
      const message=cause instanceof Error?cause.message:"Administrator setup failed.";
      return NextResponse.json({error:message},{status:message.includes("already configured")?409:400});
    }
  }
  const guestInput=z.object({profile:z.literal("guest")}).safeParse(raw);
  if(guestInput.success){
    try{
      const token=await createGuestSession();
      const response=NextResponse.json({ok:true,role:"guest"});
      response.cookies.set(sessionCookie,token,{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/",maxAge:8*3600});
      return response;
    }catch{return NextResponse.json({error:"Guest access is not configured. Set CTX_SESSION_SECRET."},{status:503});}
  }
  const input=z.object({email:z.string().email(),password:z.string().min(1).max(256)}).safeParse(raw);
  if(!input.success)return NextResponse.json({error:"Enter your administrator email and passkey."},{status:400});
  const store=outreachStore(),now=Date.now();
  const attempts=JSON.parse(String(store.setting("login-attempts")??'{"at":0,"count":0}')) as {at:number;count:number};
  if(now-attempts.at<900000&&attempts.count>=10)return NextResponse.json({error:"Too many attempts. Try again in 15 minutes."},{status:429});
  store.setSetting("login-attempts",JSON.stringify({at:now-attempts.at<900000?attempts.at:now,count:now-attempts.at<900000?attempts.count+1:1}));
  if(input.data.email.trim().toLowerCase()!==adminEmail().toLowerCase()||!verifyOperatorPassword(input.data.password))
    return NextResponse.json({error:"Email or password is incorrect."},{status:401});
  try{
    const token=await createOperatorSession(input.data.email);
    store.setSetting("login-attempts",'{"at":0,"count":0}');
    const response=NextResponse.json({ok:true});
    response.cookies.set(sessionCookie,token,{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/",maxAge:8*3600});
    return response;
  }catch{return NextResponse.json({error:"Administrator sign-in is not configured."},{status:503});}
}
export async function DELETE(request:NextRequest){
  if(request.headers.get("origin")!==request.nextUrl.origin&&request.headers.get("sec-fetch-site")!=="same-origin")return NextResponse.json({error:"Same-origin request required."},{status:403});
  const response=NextResponse.json({ok:true});response.cookies.delete(sessionCookie);return response;
}


export async function PATCH(request:NextRequest){
  if(request.headers.get("origin")!==request.nextUrl.origin && request.headers.get("sec-fetch-site")!=="same-origin")
    return NextResponse.json({error:"Same-origin request required."},{status:403});
  if(await workspaceSessionRole(request)!=="administrator")
    return NextResponse.json({error:"Administrator access required."},{status:403});
  const parsed=z.object({themePreference:z.enum(["dark","light","system"])}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid appearance preference."},{status:400});
  outreachStore().setSetting("administrator-theme",parsed.data.themePreference);
  return NextResponse.json(parsed.data,{headers:{"Cache-Control":"no-store"}});
}
