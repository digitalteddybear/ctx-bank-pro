import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ArchitectureError, architectureRepository } from "@/lib/server/architecture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function authorised(request: NextRequest) {
  const token = process.env.CTX_OUTREACH_OPERATOR_TOKEN;
  if (token) {
    const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    return token.length >= 24 && Buffer.byteLength(token) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(token), Buffer.from(supplied));
  }
  return ["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname) &&
    (request.headers.get("sec-fetch-site") === "same-origin" || request.headers.get("origin") === request.nextUrl.origin);
}
function failure(error: unknown) {
  return error instanceof ArchitectureError ? json({ error: error.message }, error.status) : json({ error: "Architecture files are unavailable. Check the local checkout and retry." }, 500);
}
export async function GET(request: NextRequest) {
  if (!authorised(request)) return json({ error: "Open CTX locally or supply the configured operator token." }, 401);
  try {
    const repo = architectureRepository();
    const id = request.nextUrl.searchParams.get("file");
    return json(id ? await repo.file(id) : await repo.tree());
  } catch (error) { return failure(error); }
}
const input = z.object({ id: z.string().min(1).max(512), content: z.string().max(512 * 1024), baseHash: z.string().regex(/^[a-f0-9]{64}$/), revision: z.string().uuid().nullable() }).strict();
export async function POST(request: NextRequest) {
  if (!authorised(request)) return json({ error: "Operator access required." }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  try {
    const raw = await request.text();
    if (raw.length > 4 * 1024 * 1024) return json({ error: "Draft too large" }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
    const parsed = input.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid draft" }, 400);
    const { id, content, baseHash, revision } = parsed.data;
    return json(await architectureRepository().saveDraft(id, content, baseHash, revision));
  } catch (error) { return failure(error); }
}
