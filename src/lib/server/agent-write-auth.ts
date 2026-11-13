import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DISALLOWED_PLACEHOLDERS } from "./auth";

export function requireAgentWrite(request: NextRequest): NextResponse | null {
  const expected = process.env.AGENT_WRITE_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        error: "HTTP graph mutation is disabled. Agents should use the project MCP server.",
      },
      { status: 403 }
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = request.headers.get("x-agent-token") ?? bearer ?? "";

  // Strictly reject development placeholders
  if (
    DISALLOWED_PLACEHOLDERS.has(supplied.toLowerCase()) ||
    DISALLOWED_PLACEHOLDERS.has(expected.toLowerCase())
  ) {
    return NextResponse.json(
      { error: "Insecure development placeholder token rejected. Use a high-entropy secret." },
      { status: 401 }
    );
  }

  if (expected.length < 24) {
    return NextResponse.json(
      { error: "AGENT_WRITE_TOKEN must be at least 24 characters." },
      { status: 403 }
    );
  }

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
