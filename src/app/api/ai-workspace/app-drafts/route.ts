import { NextRequest } from "next/server";
import { z } from "zod";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
import { AppEditorDraftError, appEditorDraftRepository } from "@/lib/server/app-editor-drafts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "App draft request failed." }, { status: error instanceof AppEditorDraftError ? error.status : 500, headers: { "Cache-Control": "no-store" } }); }
export async function GET(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  const path = request.nextUrl.searchParams.get("path"); if (!path) return Response.json({ error: "A source path is required." }, { status: 400 });
  try { return Response.json(await appEditorDraftRepository().read(path), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return failure(error); }
}
const input = z.object({ path: z.string().min(1).max(500), content: z.string().max(512 * 1024), baseHash: z.string().regex(/^[a-f0-9]{64}$/), revision: z.string().uuid().nullable() }).strict();
export async function POST(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  try {
    const raw = await request.text(); if (raw.length > 600 * 1024) return Response.json({ error: "Draft exceeds the request size limit." }, { status: 413 });
    let body:unknown; try { body=JSON.parse(raw); } catch { return Response.json({error:"Invalid JSON."},{status:400}); }
    const parsed = input.safeParse(body); if (!parsed.success) return Response.json({ error: "Invalid app draft." }, { status: 400 });
    return Response.json(await appEditorDraftRepository().save(parsed.data.path, parsed.data.content, parsed.data.baseHash, parsed.data.revision), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
