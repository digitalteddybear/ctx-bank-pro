import { timingSafeEqual, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { deploymentSecret } from "./operator-session-secrets";

export const MIN_SECRET_LENGTH = 32;
export const DISALLOWED_PLACEHOLDERS = new Set([
  "test-token",
  "default",
  "secret",
  "password",
  "admin",
  "123456",
]);

export function safeEqualSecrets(expected: string, supplied: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface AuthContext {
  authenticated: boolean;
  subject?: string;
  scope?: string[];
  error?: string;
  isSameOrigin?: boolean;
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isSameOriginRequest(request: NextRequest): boolean {
  const host = request.nextUrl.hostname;
  const isLoopback = loopbackHosts.has(host);
  const secFetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");

  const matchesOrigin = origin === request.nextUrl.origin;
  const isSameOriginHeader = secFetchSite === "same-origin";

  return isLoopback && (isSameOriginHeader || matchesOrigin);
}

export function getJwtSecretKey(): Uint8Array {
  const secret =
    deploymentSecret("CTX_JWT_SECRET") ||
    deploymentSecret("AGENT_WRITE_TOKEN") ||
    deploymentSecret("CTX_OUTREACH_OPERATOR_TOKEN");
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `PRODUCTION_AUTH_ERROR: Authentication secret must be at least ${MIN_SECRET_LENGTH} characters. Please configure CTX_JWT_SECRET or AGENT_WRITE_TOKEN.`
    );
  }
  return new TextEncoder().encode(secret);
}

export async function mintToken(
  subject: string,
  scopes: string[] = ["operator"],
  expiresIn: string = "30d"
): Promise<string> {
  const key = getJwtSecretKey();
  return await new SignJWT({ scope: scopes })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("ctx-bank-pro")
    .setAudience("ctx-agent-api")
    .setSubject(subject)
    .setExpirationTime(expiresIn)
    .sign(key);
}

export function generateSecureSecret(byteLength: number = 32): string {
  return randomBytes(byteLength).toString("hex");
}

export async function verifyApiRequest(
  request: NextRequest,
  requiredScope?: string,
  options: { allowSameOrigin?: boolean } = { allowSameOrigin: false }
): Promise<AuthContext> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "") || request.headers.get("x-agent-token") || "";

  // 1. High-entropy static token verification
  if (token) {
    if (DISALLOWED_PLACEHOLDERS.has(token.toLowerCase())) {
      return { authenticated: false, error: "Rejected insecure development placeholder token." };
    }

    const operatorToken = deploymentSecret("CTX_OUTREACH_OPERATOR_TOKEN");
    const writeToken = deploymentSecret("AGENT_WRITE_TOKEN");

    for (const validSecret of [operatorToken, writeToken].filter(Boolean)) {
      if (validSecret.length >= MIN_SECRET_LENGTH && !DISALLOWED_PLACEHOLDERS.has(validSecret.toLowerCase())) {
        if (safeEqualSecrets(validSecret, token)) {
          return {
            authenticated: true,
            subject: "bearer_service",
            scope: ["operator", "agent_write", "compliance"],
          };
        }
      }
    }

    // 2. Signed JWT Verification
    try {
      const { payload } = await jwtVerify(token, getJwtSecretKey(), {
        issuer: "ctx-bank-pro",
        audience: "ctx-agent-api",
      });
      const scopes = (payload.scope as string[]) || [];
      if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes("operator")) {
        return { authenticated: false, error: `Insufficient token scope: requires '${requiredScope}'` };
      }
      return { authenticated: true, subject: String(payload.sub), scope: scopes };
    } catch {
      return { authenticated: false, error: "Invalid or expired authorization token." };
    }
  }

  // 3. Same-origin fallback for browser dashboard when configured
  if (options.allowSameOrigin && isSameOriginRequest(request)) {
    return {
      authenticated: true,
      subject: "same_origin_dashboard",
      scope: ["operator", "agent_write", "compliance"],
      isSameOrigin: true,
    };
  }

  return { authenticated: false, error: "Missing or invalid authorization token." };
}
