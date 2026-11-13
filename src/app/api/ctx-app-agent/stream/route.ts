import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startRunInputSchema } from "@/lib/ai-workspace-contract";
import { CtxAgentError, runCtxAppAgent } from "@/lib/server/ctx-app-agent";
import { AIWorkspaceError, aiWorkspaceStore } from "@/lib/server/ai-workspace-store";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
import { finishWorkspaceRun, registerWorkspaceRun } from "@/lib/server/ai-workspace-run-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  return request.headers.get("sec-fetch-site") === "same-origin" || request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request) || !hasLocalWorkspaceAccess(request)) return Response.json({ error: "Local same-origin access required." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required." }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 180_000) return Response.json({ error: "Request exceeds the 180 KB limit." }, { status: 413 });
  let unknownBody: unknown;
  try { unknownBody = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = startRunInputSchema.safeParse(unknownBody);
  if (!parsed.success) return Response.json({ error: "Invalid run request." }, { status: 400 });
  const input = parsed.data;
  const store = aiWorkspaceStore();
  const conversation = store.getConversation(input.conversationId);
  if (!conversation) return Response.json({ error: "Chat not found." }, { status: 404 });
  if (!conversation.messages.some(message => message.id === input.assistantMessageId && message.role === "assistant")) return Response.json({ error: "Assistant message was not saved before starting the run." }, { status: 409 });
  let run: ReturnType<typeof store.createRun>["run"];
  let created = false;
  try {
    const result = store.createRun({ id: input.requestId, requestId: input.requestId, conversationId: input.conversationId, assistantMessageId: input.assistantMessageId });
    run = result.run; created = result.created;
  } catch (error) {
    const status = error instanceof AIWorkspaceError ? error.status : 409;
    return Response.json({ error: error instanceof Error ? error.message : "Could not start the run." }, { status });
  }
  if (!created) {
    if (run.conversationId !== input.conversationId || run.assistantMessageId !== input.assistantMessageId) return Response.json({error:"The request ID belongs to another run."},{status:409});
    const previous = store.eventsAfter(run.id, 0);
    if (!previous.some(event => event.type.startsWith("run." ) && ["run.completed", "run.failed", "run.cancelled"].includes(event.type))) {
      return Response.json({ error: "This request is already running. Reconnect to its event stream." }, { status: 409, headers: { "x-ctx-run-id": run.id } });
    }
    return Response.json({ error: "This request has already completed. Reload the chat to see its saved response.", runId: run.id }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const controller = new AbortController();
  registerWorkspaceRun(run.id, controller);
  let streamOpen = true;
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      const send = (event: unknown) => { if (streamOpen) streamController.enqueue(encoder.encode(`event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`)); };
      const persist = (type: Parameters<typeof store.appendRunEvent>[2], payload: Record<string, unknown>) => {
        const event = store.appendRunEvent(run.id, input.conversationId, type, payload);
        send(event);
      };
      void (async () => {
        try {
          persist("run.started", { requestId: input.requestId });
          let text = "";
          const toolArtifactIds = new Set<string>();
          const result = await runCtxAppAgent({ prompt: input.prompt, history: input.history, documentIds: input.documentIds, settings: input.settings, task: input.task }, chunk => {
            text += chunk;
            persist("text.delta", { text: chunk });
            store.updateMessage(input.conversationId, input.assistantMessageId, { content: text, status: "streaming", runId: run.id });
          }, controller.signal, {conversationId:input.conversationId,runId:run.id}, (call,stage) => {
            const savedMessage=store.getConversation(input.conversationId)?.messages.find(item=>item.id===input.assistantMessageId);
            const calls=[...(savedMessage?.toolCalls??[]).filter(item=>item.id!==call.id),{id:call.id,name:call.name,target:call.target,status:stage==='started'?'running':call.status,duration:call.duration,...(call.errorMessage?{errorMessage:call.errorMessage}:{}),...(call.result?{result:call.result}:{})}];
            store.updateMessage(input.conversationId,input.assistantMessageId,{toolCalls:calls,runId:run.id});
            persist(stage==='started'?"tool.started":"tool.finished",{toolCall:calls.at(-1)});
            if(stage==='finished'&&call.status==='complete'&&(call.name==='create_artifact'||call.name==='update_artifact')){
              try{const value=JSON.parse(call.result) as {artifactId?:unknown;version?:unknown;title?:unknown};if(typeof value.artifactId==='string'){toolArtifactIds.add(value.artifactId);persist(call.name==='create_artifact'?"artifact.created":"artifact.version.completed",{artifactId:value.artifactId,version:value.version,title:value.title});}}catch{/* Tool result remains visible even when metadata parsing fails. */}
            }
          });
          const artifactIds: string[] = [...toolArtifactIds];
          const provenance = { provider: result.provider, model: result.model, runId: run.id, createdAt: new Date().toISOString(), promptHash: (await import("node:crypto")).createHash("sha256").update(input.prompt).digest("hex") };
          for (const draft of result.artifacts ?? []) {
            const artifact = store.createArtifact({ id: randomUUID(), conversationId: input.conversationId, title: draft.title, type: draft.type, status: "ready", version: { artifactId: "pending", version: 1, files: draft.files, sourceReferences: result.citations?.map(({id,title,url,kind,retrievedAt})=>({id,title,url,kind,retrievedAt})) ?? [], provenance, createdAt: new Date().toISOString() } });
            artifactIds.push(artifact.id);
          }
          for (const widget of result.widgets) {
            if (widget.type !== "architecture-diff" || !widget.data.fileId?.startsWith("app-editor/") || !widget.data.proposedContent) continue;
            const extension = widget.data.filePath.split(".").at(-1) ?? "tsx";
            const artifact = store.createArtifact({ id: randomUUID(), conversationId: input.conversationId, title: widget.data.filePath.split("/").at(-1) ?? "App draft", type: "code", status: "draft", version: { artifactId: "pending", version: 1, files: [{ path: widget.data.filePath.split("/").at(-1) ?? "draft.tsx", language: extension === "tsx" || extension === "ts" ? "typescript" : extension, content: widget.data.proposedContent }], sourceReferences: result.citations?.map(({id,title,url,kind,retrievedAt})=>({id,title,url,kind,retrievedAt})) ?? [], provenance, createdAt: new Date().toISOString() } });
            artifactIds.push(artifact.id);
          }
          const completedResult = { text: result.text, widgets: result.widgets, provider: result.provider, model: result.model, ...(result.trace ? {trace:result.trace} : {}), ...(result.citations?.length ? {citations:result.citations} : {}), ...(artifactIds.length ? { artifactIds } : {}) };
          store.updateMessage(input.conversationId, input.assistantMessageId, { content: result.text, widgets: result.widgets, artifactIds, citations: result.citations, provider: result.provider, model: result.model, status: "complete", runId: run.id });
          persist("run.completed", completedResult as unknown as Record<string, unknown>);
        } catch (error) {
          const message = error instanceof Error ? error.message : "CTX App Agent could not complete this request.";
          const status = error instanceof CtxAgentError ? error.status : 500;
          try {
            const saved = store.getConversation(input.conversationId)?.messages.find(item => item.id === input.assistantMessageId);
            store.updateMessage(input.conversationId, input.assistantMessageId, { status: "error", ...(saved?.content ? {} : { content: message }) });
            persist(controller.signal.aborted ? "run.cancelled" : "run.failed", { status, error: message });
          } catch { /* Preserve the original inference failure if the local store became unavailable. */ }
        } finally {
          finishWorkspaceRun(run.id);
          streamOpen = false;
          try { streamController.close(); } catch { /* Client already closed the stream. */ }
        }
      })();
    },
    cancel() { streamOpen = false; },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no", "x-ctx-run-id": run.id } });
}
