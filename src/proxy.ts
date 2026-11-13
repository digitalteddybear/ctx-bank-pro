import { NextRequest, NextResponse } from "next/server";
import { deploymentSecret, validOperatorSession } from "./lib/server/operator-session";

export async function proxy(request: NextRequest) {
  if(process.env.CTX_REQUIRE_LOGIN!=="true")return NextResponse.next();
  const path=request.nextUrl.pathname;
  if(["/login","/api/session","/api/ready","/api/webhooks/cal","/api/auth/openai/callback"].includes(path))return NextResponse.next();
  const operator=deploymentSecret("CTX_OUTREACH_OPERATOR_TOKEN");
  const supplied=request.headers.get("authorization")?.replace(/^Bearer /i,"");
  const serviceAccess=Boolean(operator.length>=32&&supplied===operator);
  if(!serviceAccess&&!await validOperatorSession(request)){
    if(path.startsWith("/api/"))return NextResponse.json({error:"Sign in to CTX."},{status:401});
    return NextResponse.redirect(new URL("/login",request.url));
  }
  if(!serviceAccess){
    if(operator.length<32)return NextResponse.json({error:"Hosted operator token is not configured."},{status:503});
    const headers=new Headers(request.headers);
    headers.set("authorization","Bearer "+operator);
    const write=deploymentSecret("AGENT_WRITE_TOKEN");
    if(write)headers.set("x-agent-token",write);
    return NextResponse.next({request:{headers}});
  }
  return NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|assets/).*)"]};
