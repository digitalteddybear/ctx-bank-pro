import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { DISALLOWED_PLACEHOLDERS } from "./auth";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function hasLocalWorkspaceAccess(request: NextRequest): boolean {
  const token = process.env.CTX_OUTREACH_OPERATOR_TOKEN;
  if (token) {
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (DISALLOWED_PLACEHOLDERS.has(supplied.toLowerCase()) || DISALLOWED_PLACEHOLDERS.has(token.toLowerCase())) {
      return false;
    }
    return (
      token.length >= 24 &&
      Buffer.byteLength(token) === Buffer.byteLength(supplied) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(supplied))
    );
  }
  const sameOrigin =
    request.headers.get("sec-fetch-site") === "same-origin" ||
    request.headers.get("origin") === request.nextUrl.origin;
  return loopbackHosts.has(request.nextUrl.hostname) && sameOrigin;
}

export function localWorkspaceFailure(request: NextRequest) {
  return Response.json(
    {
      error: hasLocalWorkspaceAccess(request)
        ? "The workspace request could not be completed."
        : "Open CTX locally or provide the configured operator token.",
    },
    { status: hasLocalWorkspaceAccess(request) ? 500 : 401, headers: { "Cache-Control": "no-store" } }
  );
}
