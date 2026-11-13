import { NextRequest } from "next/server";
import { aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ runId: string }> };
export async function GET(request: NextRequest, context: Context) {
  if (!hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local workspace access required." }, { status: 401 });
  const { runId } = await context.params; const run = aiWorkspaceStore().getRun(runId);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  const initial = Number(request.nextUrl.searchParams.get("after") ?? "0");
  if (!Number.isSafeInteger(initial) || initial < 0) return Response.json({ error: "Invalid event cursor." }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cursor = initial; let closed = false;
      const close = () => { if (!closed) { closed = true; clearInterval(timer); request.signal.removeEventListener("abort", close); try { controller.close(); } catch { /* Already closed. */ } } };
      const poll = () => {
        if (closed) return;
        try {
          const events = aiWorkspaceStore().eventsAfter(runId, cursor);
          for (const event of events) { cursor = event.sequence; controller.enqueue(encoder.encode(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)); }
          if (events.some(event => ["run.completed", "run.failed", "run.cancelled"].includes(event.type))) close();
        } catch { close(); }
      };
      const timer = setInterval(poll, 400);
      request.signal.addEventListener("abort", close, { once: true });
      poll();
    },
    cancel() { /* Event polling is terminated by the request signal. */ },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
