import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { adminEmail, sessionSigningSecret, verifyAdminPasskey } from "./ctx-profile-store";
export { deploymentSecret } from "./operator-session-secrets";

export const sessionCookie = "ctx-operator";
export type WorkspaceRole = "administrator" | "guest";
function signingKey() {
  const secret = sessionSigningSecret();
  if (secret.length < 32) throw new Error("Configure CTX_SESSION_SECRET with at least 32 characters.");
  return new TextEncoder().encode(secret);
}
export async function createOperatorSession(email: string) {
  return new SignJWT({role:"administrator" satisfies WorkspaceRole}).setProtectedHeader({alg:"HS256"}).setSubject(email)
    .setIssuer("ctx-console").setAudience("ctx-console").setIssuedAt().setExpirationTime("8h").sign(signingKey());
}
export async function createGuestSession() {
  return new SignJWT({role:"guest" satisfies WorkspaceRole}).setProtectedHeader({alg:"HS256"}).setSubject("guest")
    .setIssuer("ctx-console").setAudience("ctx-console").setIssuedAt().setExpirationTime("8h").sign(signingKey());
}
export async function workspaceSessionRole(request: NextRequest): Promise<WorkspaceRole | null> {
  try {
    const token=request.cookies.get(sessionCookie)?.value;
    if(!token)return null;
    const {payload}=await jwtVerify(token,signingKey(),{issuer:"ctx-console",audience:"ctx-console",algorithms:["HS256"]});
    if(payload.role==="administrator" && payload.sub===adminEmail())return "administrator";
    if(payload.role==="guest" && payload.sub==="guest")return "guest";
    return null;
  }catch{return null;}
}
export async function validOperatorSession(request: NextRequest) {
  return (await workspaceSessionRole(request)) === "administrator";
}
export function verifyOperatorPassword(password: string) {
  return verifyAdminPasskey(adminEmail(), password);
}
