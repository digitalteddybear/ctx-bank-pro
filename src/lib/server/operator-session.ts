import { readFileSync } from "node:fs";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export const sessionCookie = "ctx-operator";
export function deploymentSecret(name: string): string {
  const filename = process.env[name + "_FILE"];
  return (filename ? readFileSync(filename, "utf8") : process.env[name] ?? "").trim();
}
function signingKey() {
  const secret = deploymentSecret("CTX_SESSION_SECRET");
  if (secret.length < 32) throw new Error("Configure CTX_SESSION_SECRET with at least 32 characters.");
  return new TextEncoder().encode(secret);
}
export async function createOperatorSession(email: string) {
  return new SignJWT({role:"administrator"}).setProtectedHeader({alg:"HS256"}).setSubject(email)
    .setIssuer("ctx-console").setAudience("ctx-console").setIssuedAt().setExpirationTime("8h").sign(signingKey());
}
export async function validOperatorSession(request: NextRequest) {
  try {
    const token=request.cookies.get(sessionCookie)?.value;
    if(!token)return false;
    const {payload}=await jwtVerify(token,signingKey(),{issuer:"ctx-console",audience:"ctx-console",algorithms:["HS256"]});
    return payload.role==="administrator" && payload.sub===process.env.CTX_ADMIN_EMAIL;
  }catch{return false;}
}
export function verifyOperatorPassword(password: string) {
  const [algorithm,salt,encoded]=deploymentSecret("CTX_ADMIN_PASSWORD_HASH").split(":");
  if(algorithm!=="scrypt"||!salt||!encoded||!/^[a-f0-9]{128}$/.test(encoded))return false;
  const expected=Buffer.from(encoded,"hex"),actual=scryptSync(password,salt,64);
  return timingSafeEqual(expected,actual);
}
