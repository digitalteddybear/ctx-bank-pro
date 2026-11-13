import { NextRequest, NextResponse } from "next/server";
import { deploymentSecret, workspaceSessionRole } from "./lib/server/operator-session";
import { hasAdminProfile } from "./lib/server/ctx-profile-store";

export async function proxy(request: NextRequest) {
  const path=request.nextUrl.pathname;
  if(["/login","/login-card","/api/session","/api/ready","/api/webhooks/cal","/api/auth/openai/callback"].includes(path))return NextResponse.next();
  if(path==="/api/health"&&request.method==="GET")return NextResponse.next();
  const sessionRole=await workspaceSessionRole(request);
  if(sessionRole==="guest"){
    if(path.startsWith("/api/")){
      const guestApiAllowed=(path==="/api/session"&&(request.method==="GET"||request.method==="DELETE"))||
        ((path==="/api/status"||path==="/api/health"||path==="/api/ready")&&request.method==="GET");
      if(!guestApiAllowed)return NextResponse.json({error:"This area is not available to guest profiles."},{status:403,headers:{"Cache-Control":"no-store"}});
      return NextResponse.next();
    }
    const requestedView=request.nextUrl.searchParams.get("view");
    if(path!=="/"||(requestedView&&requestedView!=="dashboard"))return NextResponse.redirect(new URL("/?view=dashboard",request.url));
    return NextResponse.next();
  }
  if(!hasAdminProfile()){
    if(path.startsWith("/api/"))return NextResponse.json({error:"Complete administrator setup before using CTX."},{status:401});
    return NextResponse.redirect(new URL("/login",request.url));
  }
  const operator=deploymentSecret("CTX_OUTREACH_OPERATOR_TOKEN");
  const supplied=request.headers.get("authorization")?.replace(/^Bearer /i,"");
  const serviceAccess=Boolean(operator.length>=32&&supplied===operator);
  const role=serviceAccess?"administrator":sessionRole;
  if(!role){
    if(path.startsWith("/api/"))return NextResponse.json({error:"Sign in to CTX."},{status:401});
    return NextResponse.redirect(new URL("/login",request.url));
  }
  if(!serviceAccess){
    if(operator.length<32)return NextResponse.next();
    const headers=new Headers(request.headers);
    headers.set("authorization","Bearer "+operator);
    const write=deploymentSecret("AGENT_WRITE_TOKEN");
    if(write)headers.set("x-agent-token",write);
    return NextResponse.next({request:{headers}});
  }
  return NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|assets/).*)"]};
