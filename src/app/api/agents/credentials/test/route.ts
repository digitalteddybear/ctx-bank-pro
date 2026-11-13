import { NextRequest } from "next/server";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
import { senderCredentialsSchema, testSenderConnection } from "@/lib/server/outreach/credentials";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Operator access required." }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin && request.headers.get("sec-fetch-site") !== "same-origin") return Response.json({error:"Same-origin request required."},{status:403});
  const raw = await request.text();
  if (raw.length > 2048) return Response.json({ error: "Request too large." }, { status: 413 });
  let value: unknown; try { value = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = senderCredentialsSchema.safeParse(value);
  if (!parsed.success) return Response.json({ error: "Enter a sender email and a 16-character Google App Password." }, { status: 400 });
  return Response.json(await testSenderConnection(parsed.data), { headers: { "Cache-Control": "no-store" } });
}
