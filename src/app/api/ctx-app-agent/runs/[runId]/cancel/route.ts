import { NextRequest } from "next/server";
import { aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { cancelWorkspaceRun } from "@/lib/server/ai-workspace-run-registry";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ runId: string }> };
export async function POST(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  const { runId } = await context.params; const run = aiWorkspaceStore().getRun(runId);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "running") return Response.json({ cancelled: false, status: run.status });
  return Response.json({ cancelled: cancelWorkspaceRun(runId) });
}
