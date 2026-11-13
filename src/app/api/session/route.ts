import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOperatorSession, sessionCookie, verifyOperatorPassword } from "@/lib/server/operator-session";
import { outreachStore } from "@/lib/server/outreach/store-instance";

export const runtime="nodejs";
export async function POST(request:NextRequest){
  if(request.headers.get("origin")!==request.nextUrl.origin&&request.headers.get("sec-fetch-site")!=="same-origin")
    return NextResponse.json({error:"Same-origin request required."},{status:403});
  const input=z.object({email:z.string().email(),password:z.string().min(1).max(256)}).safeParse(await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({error:"Enter your email and password."},{status:400});
  const store=outreachStore(),now=Date.now();
  const attempts=JSON.parse(String(store.setting("login-attempts")??'{"at":0,"count":0}')) as {at:number;count:number};
  if(now-attempts.at<900000&&attempts.count>=10)return NextResponse.json({error:"Too many attempts. Try again in 15 minutes."},{status:429});
  store.setSetting("login-attempts",JSON.stringify({at:now-attempts.at<900000?attempts.at:now,count:now-attempts.at<900000?attempts.count+1:1}));
  if(input.data.email!==process.env.CTX_ADMIN_EMAIL||!verifyOperatorPassword(input.data.password))
    return NextResponse.json({error:"Email or password is incorrect."},{status:401});
  try{
    const token=await createOperatorSession(input.data.email);
    store.setSetting("login-attempts",'{"at":0,"count":0}');
    const response=NextResponse.json({ok:true});
    response.cookies.set(sessionCookie,token,{httpOnly:true,secure:process.env.CTX_REQUIRE_LOGIN==="true",sameSite:"lax",path:"/",maxAge:8*3600});
    return response;
  }catch{return NextResponse.json({error:"Administrator sign-in is not configured."},{status:503});}
}
export async function DELETE(request:NextRequest){
  if(request.headers.get("origin")!==request.nextUrl.origin&&request.headers.get("sec-fetch-site")!=="same-origin")return NextResponse.json({error:"Same-origin request required."},{status:403});
  const response=NextResponse.json({ok:true});response.cookies.delete(sessionCookie);return response;
}
