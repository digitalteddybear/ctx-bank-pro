import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function requireAgentWrite(request: NextRequest) {
  const expected = process.env.AGENT_WRITE_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        error: "HTTP graph mutation is disabled. Agents should use the project MCP server.",
      },
      { status: 403 },
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = request.headers.get("x-agent-token") ?? bearer ?? "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  const authorized =
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer);

  if (!authorized) {
    return NextResponse.json({ error: "Agent write authorization required." }, { status: 401 });
  }

  return null;
}
