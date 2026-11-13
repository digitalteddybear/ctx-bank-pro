/**
 * Isolated Microservice Gateway Endpoint for Zero-Trust HubSpot Operations.
 *
 * Implements Requirement 12:
 * Isolates the raw HUBSPOT_ACCESS_TOKEN behind an independently authenticated gateway service.
 * External agent runtimes or sub-services call this endpoint with HUBSPOT_GATEWAY_SHARED_SECRET,
 * preventing any direct credential exposure to the agent process.
 */
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getHubSpotGateway } from "@/lib/server/integrations/hubspot-gateway";
import type { PermittedOperation } from "@/lib/server/integrations/hubspot-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedServiceCall(request: NextRequest): boolean {
  const secret = process.env.HUBSPOT_GATEWAY_SHARED_SECRET || process.env.CTX_OUTREACH_OPERATOR_TOKEN;
  if (!secret || secret.length < 24) return false;

  const authHeader = request.headers.get("authorization") || "";
  const supplied = authHeader.replace(/^Bearer\s+/i, "");

  const a = Buffer.from(secret);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedServiceCall(request)) {
    return NextResponse.json(
      { error: "Unauthorized: Valid HUBSPOT_GATEWAY_SHARED_SECRET bearer token required." },
      { status: 401 }
    );
  }

  let body: { operation?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { operation, payload } = body;
  const gateway = getHubSpotGateway();

  switch (operation as PermittedOperation) {
    case "updateOutreachStatus": {
      const result = await gateway.updateOutreachStatus(payload);
      return NextResponse.json(result, { status: result.success ? 200 : 403 });
    }
    case "logEmailEngagement": {
      const result = await gateway.logEmailEngagement(payload);
      return NextResponse.json(result, { status: result.success ? 200 : 403 });
    }
    case "logReplyEngagement": {
      const result = await gateway.logReplyEngagement(payload);
      return NextResponse.json(result, { status: result.success ? 200 : 403 });
    }
    default:
      return NextResponse.json(
        {
          error: `Unauthorized operation '${operation}'. Permitted operations: updateOutreachStatus, logEmailEngagement, logReplyEngagement.`,
        },
        { status: 403 }
      );
  }
}
