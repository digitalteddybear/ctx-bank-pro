"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@astryxdesign/core/Button";
import { ChatComposer, ChatComposerDrawer, ChatComposerInput, ChatDictationButton, ChatMessage, ChatMessageBubble, ChatMessageList, ChatToolCalls, useChatDictation, type ChatComposerInputHandle } from "@astryxdesign/core/Chat";
import { HStack, Layout, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Token } from "@astryxdesign/core/Token";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Check, Copy, Download, RotateCcw, Trash2 } from "lucide-react";
import { FolderIcon, PaperClipIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useGraphStore } from "@/lib/graph/store";
import { useAIChatStore, type AIChatAttachment, type AIChatMessage } from "@/lib/ai-chat-store";
import { AI_SETTINGS_STORAGE_KEY, aiSettingsSchema, aiSettingsSnapshotSchema } from "@/lib/ai-settings";
import { ctxAgentResponseSchema } from "@/lib/ctx-app-agent-contract";
import { ChatComposerFx, ChatThinkingStatus, triggerFullScreenGenerativeWave } from "@/components/network/chat-composer-fx";
import { ModelSelectorPopover } from "@/components/network/model-selector-popover";
import type { GenerativeWidgetPayload } from "@/components/network/generative-ui/types";
import { ArchitectureDiffWidget } from "@/components/network/generative-ui/architecture-diff-widget";
import { ComplianceGateWidget } from "@/components/network/generative-ui/compliance-gate-widget";
import { FleetTraceWidget } from "@/components/network/generative-ui/fleet-trace-widget";
import { LeadQualificationWidget } from "@/components/network/generative-ui/lead-qualification-widget";
import { NeuralSubGraphWidget } from "@/components/network/generative-ui/neural-subgraph-widget";
import { requestBackendSync } from "@/lib/backend-sync";
import { aiWorkspaceArtifactSchema, aiWorkspaceToolCallSchema, type AIWorkspaceArtifact } from "@/lib/ai-workspace-contract";

function renderWidget(widget: GenerativeWidgetPayload, key: string) {
  switch (widget.type) {
    case "architecture-diff": return <ArchitectureDiffWidget key={key} data={widget.data} />;
    case "compliance-gate": return <ComplianceGateWidget key={key} data={widget.data} />;
    case "fleet-trace": return <FleetTraceWidget key={key} data={widget.data} />;
    case "lead-qualification": return <LeadQualificationWidget key={key} data={widget.data} />;
    case "neural-subgraph": return <NeuralSubGraphWidget key={key} data={widget.data} />;
  }
}

function eventPayload(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("The assistant returned an invalid stream event.");
  return value as Record<string, unknown>;
}


const previewResponseSchema = z.object({javascript:z.string().max(4*1024*1024),css:z.string().max(4*1024*1024),diagnostics:z.array(z.string()).max(20),sourceVersion:z.number().int().positive()}).strict();
const iframeMessageSchema = z.object({nonce:z.string().uuid(),type:z.enum(["error","ready"]),message:z.string().optional()}).strict();
function ArtifactPreviewPanel({artifact}: {artifact: AIWorkspaceArtifact}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameDocument, setFrameDocument] = useState("");
  const [bundle, setBundle] = useState<{javascript:string;css:string}|null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [frameReady, setFrameReady] = useState(false);
  const nonceRef = useRef("");
  useEffect(() => {
    let active = true; setLoading(true); setFrameReady(false); setError(""); setBundle(null); setDiagnostics([]);
    void fetch("/api/ai-workspace/previews", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({artifactId:artifact.id,version:artifact.version?.version}),cache:"no-store"})
      .then(async response => { const value:unknown = await response.json(); if (!response.ok) { const parsed=z.object({error:z.string()}).safeParse(value); throw new Error(parsed.success?parsed.data.error:"Preview could not be built."); } const parsed=previewResponseSchema.safeParse(value); if (!parsed.success) throw new Error("Preview compiler returned an invalid response."); return parsed.data; })
      .then(result => {
        if (!active) return;
        setBundle({javascript:result.javascript,css:result.css}); setDiagnostics(result.diagnostics);
        const nonce=crypto.randomUUID(); nonceRef.current=nonce;
        const csp=`default-src 'none'; script-src 'nonce-${nonce}' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'`;
        setFrameDocument(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{min-height:100%;margin:0}body{background:#121316;color:#e8e9ec;font:14px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}:root{--background:#121316;--foreground:#e8e9ec;--card:#1b1c20;--border:#33353b;--accent:#9aa7ff;--spacing-1:4px;--spacing-2:8px;--spacing-3:12px;--spacing-4:16px;--spacing-6:24px;--radius:8px}</style></head><body><main id="root"></main><script nonce="${nonce}">const n="${nonce}";addEventListener("error",e=>parent.postMessage({nonce:n,type:"error",message:String(e.message||"Preview error").slice(0,500)},"*"));addEventListener("unhandledrejection",e=>parent.postMessage({nonce:n,type:"error",message:String(e.reason||"Preview error").slice(0,500)},"*"));addEventListener("message",e=>{if(e.source!==parent||!e.data||e.data.nonce!==n||typeof e.data.javascript!=="string"||typeof e.data.css!=="string")return;const s=document.createElement("style");s.textContent=e.data.css;document.head.appendChild(s);const b=new Blob([e.data.javascript],{type:"text/javascript"});const u=URL.createObjectURL(b);const script=document.createElement("script");script.src=u;script.onload=()=>{URL.revokeObjectURL(u);parent.postMessage({nonce:n,type:"ready"},"*")};script.onerror=()=>parent.postMessage({nonce:n,type:"error",message:"Preview script failed to load."},"*");document.body.appendChild(script)});</script></body></html>`);
      })
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Preview could not be built.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[artifact.id,artifact.version?.version]);
  useEffect(()=>{
    if(!bundle)return;
    const timeout=setTimeout(()=>{if(!frameReady)setError("Preview did not start within 10 seconds.");},10_000);
    return ()=>clearTimeout(timeout);
  },[bundle,frameReady]);
  useEffect(()=>{
    const receive=(event:MessageEvent<unknown>)=>{
      if(event.source!==frameRef.current?.contentWindow||event.origin!=="null")return;
      const parsed=iframeMessageSchema.safeParse(event.data); if(!parsed.success||parsed.data.nonce!==nonceRef.current)return;
      if(parsed.data.type==="ready")setFrameReady(true);
      if(parsed.data.type==="error")setError(parsed.data.message??"Preview encountered a runtime error.");
    };
    window.addEventListener("message",receive); return ()=>window.removeEventListener("message",receive);
  },[bundle]);
  return <VStack gap={2} style={{minHeight:360,height:"100%"}}>{loading&&<Text type="supporting">Building preview…</Text>}{!loading&&!frameReady&&!error&&<Text type="supporting">Starting isolated preview…</Text>}{error&&<Text role="alert">{error}</Text>}{diagnostics.map((item,index)=><Text key={`${index}-${item}`} type="supporting">{item}</Text>)}{frameDocument&&<iframe ref={frameRef} title={`Preview: ${artifact.title}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={frameDocument} onLoad={() => { if (bundle && nonceRef.current) frameRef.current?.contentWindow?.postMessage({nonce:nonceRef.current,...bundle},"*"); }} style={{width:"100%",minHeight:360,flex:1,border:"1px solid var(--border)",borderRadius:8,background:"var(--background)"}} />}</VStack>;
}

export function AIChatConversationView({ conversationId, onMissionControl }: { conversationId: string | null; onMissionControl: () => void }) {
  const hydrated = useAIChatStore(state => state.hydrated);
  const conversation = useAIChatStore(state => state.conversations.find(item => item.id === conversationId));
  const hydrate = useAIChatStore(state => state.hydrate);
  const addMessage = useAIChatStore(state => state.addMessage);
  const updateMessage = useAIChatStore(state => state.updateMessage);
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const wavedWidgetMessageIdsRef = useRef<Set<string>>(new Set());
  const dictation = useChatDictation({
    inputRef,
    continuous: true,
    interimResults: true,
    onError: (err) => setError(err.message || "Microphone dictation is unavailable."),
  });
  const running = useRef(false);
  const handledInitial = useRef<string | null>(null);
  const [attachments, setAttachments] = useState<AIChatAttachment[]>([]);
  const [error, setError] = useState("");
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [artifactTab, setArtifactTab] = useState("preview");
  const [artifacts, setArtifacts] = useState<AIWorkspaceArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  const forceTranscriptFollow = useRef(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const artifactPanel = useResizable({ defaultSize: "42%", minSizePx: 320, maxSizePx: 900, autoSaveId: "ctx-ai-chat-workspace" });
  const [isStreaming, setIsStreaming] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  useEffect(() => { if (!hydrated) hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!conversationId || !hydrated) return;
    let active = true;
    void fetch(`/api/ai-workspace/artifacts?conversationId=${encodeURIComponent(conversationId)}`, {cache:"no-store"})
      .then(async response => { const value: unknown = await response.json(); if (!response.ok || typeof value !== "object" || value === null || !("artifacts" in value) || !Array.isArray(value.artifacts)) return []; return value.artifacts.flatMap(item => { const result = aiWorkspaceArtifactSchema.safeParse(item); return result.success ? [result.data] : []; }); })
      .then(items => { if (active) { setArtifacts(items); setActiveArtifactId(current => current && items.some(item => item.id === current) ? current : items[0]?.id ?? null); } });
    return () => { active = false; };
  }, [conversationId, hydrated, conversation?.messages.at(-1)?.artifactIds?.join(",")]);

  const send = useCallback(async (prompt: string, files: AIChatAttachment[] = []) => {
    if (!conversationId || !prompt.trim() || running.current) return;
    running.current = true;
    followTranscript.current = true; forceTranscriptFollow.current = true;
    setError(""); setIsStreaming(true);
    const current = useAIChatStore.getState().conversations.find(item => item.id === conversationId);
    if (!current) { running.current = false; setIsStreaming(false); return; }
    const now = new Date().toISOString();
    const existingLast = current.messages.at(-1);
    const reusingLandingPrompt = existingLast?.role === "user" && existingLast.content === prompt && (files.length === 0 || existingLast.attachments?.some(file => files.some(upload => upload.id === file.id)));
    const userMessage: AIChatMessage = reusingLandingPrompt ? existingLast : { id: crypto.randomUUID(), role: "user", content: prompt, createdAt: now, status: "complete", ...(files.length ? { attachments: files } : {}) };
    const assistantId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const assistantMessage: AIChatMessage = { id: assistantId, role: "assistant", content: "", createdAt: now, status: "streaming", runId: requestId };
    try {
      if (!reusingLandingPrompt) await addMessage(conversationId, userMessage);
      await addMessage(conversationId, assistantMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this message.");
      running.current = false; setIsStreaming(false); return;
    } 
    try {
      const settingsResponse=await fetch("/api/ai-workspace/settings",{cache:"no-store"});
      if(!settingsResponse.ok)throw new Error("Could not load saved AI settings. Retry when CTX reconnects.");
      const savedSettings=aiSettingsSnapshotSchema.parse(await settingsResponse.json());
      let settings = savedSettings.settings;
      if(savedSettings.revision===0)try { const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY); if (raw) settings = aiSettingsSchema.parse(JSON.parse(raw)); } catch { /* Use server defaults when legacy browser storage is unavailable. */ }
      const appEdit = Boolean(settings.models.appEditor.targetFile.trim()) && /\b(edit|change|modify|patch|style|layout|redesign)\b/i.test(prompt);
      const task = appEdit ? "app-edit" : current.task === "research" || /\b(research|sources|cite|evidence|investigate|look up)\b/i.test(prompt) ? "research" : current.task === "code" || /\b(code|function|bug|typescript|react|implementation)\b/i.test(prompt) ? "code" : "general";
      const history = (reusingLandingPrompt ? current.messages : [...current.messages, userMessage]).slice(-21).map(message => ({ role: message.role, content: message.content }));
      const response = await fetch("/api/ctx-app-agent/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, conversationId, userMessageId: userMessage.id, assistantMessageId: assistantId, prompt, history: history.slice(0, -1), documentIds: files.map(file => file.id), settings, task }), signal: undefined });
      if (!response.ok) { const result: unknown = await response.json(); const body = eventPayload(result); throw new Error(typeof body.error === "string" ? body.error : "Assistant request failed."); }
      const serverRunId = response.headers.get("x-ctx-run-id");
      if (serverRunId) useAIChatStore.getState().setLocalMessage(conversationId, assistantId, { runId: serverRunId });
      if (!response.body) throw new Error("The assistant did not open a response stream.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let completed = false;
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const event = frame.split("\n").find(line => line.startsWith("event:"))?.slice(6).trim();
          const data = frame.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim();
          if (data) {
            const payload = eventPayload(JSON.parse(data));
            if (event === "text.delta" && typeof payload.payload === "object" && payload.payload !== null && "text" in payload.payload && typeof payload.payload.text === "string") { const previous = useAIChatStore.getState().conversations.find(item => item.id === conversationId)?.messages.find(message => message.id === assistantId)?.content ?? ""; useAIChatStore.getState().setLocalMessage(conversationId, assistantId, { content: previous + payload.payload.text }); }
            if ((event === "tool.started" || event === "tool.finished") && typeof payload.payload === "object" && payload.payload !== null && "toolCall" in payload.payload) { const parsedTool=aiWorkspaceToolCallSchema.safeParse(payload.payload.toolCall); if(parsedTool.success){ const old=useAIChatStore.getState().conversations.find(item=>item.id===conversationId)?.messages.find(message=>message.id===assistantId)?.toolCalls??[]; useAIChatStore.getState().setLocalMessage(conversationId,assistantId,{toolCalls:[...old.filter(call=>call.id!==parsedTool.data.id),parsedTool.data]}); } }
            if (event === "run.completed" && typeof payload.payload === "object" && payload.payload !== null) {
              const result = ctxAgentResponseSchema.safeParse(payload.payload);
              if (!result.success) throw new Error("The assistant returned an invalid completion.");
              await updateMessage(conversationId, assistantId, { content: result.data.text, widgets: result.data.widgets, artifactIds: result.data.artifactIds, citations: result.data.citations, provider: result.data.provider, model: result.data.model, status: "complete", runId: typeof payload.runId === "string" ? payload.runId : undefined });
              if (result.data.widgets?.length || result.data.artifactIds?.length) setArtifactOpen(true);
              completed = true; requestBackendSync();
            }
            if (event === "run.failed") { const detail = typeof payload.payload === "object" && payload.payload !== null && "error" in payload.payload && typeof payload.payload.error === "string" ? payload.payload.error : "Assistant generation failed."; throw new Error(detail); }
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (!completed) throw new Error("The assistant stream ended before completion.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Assistant generation failed.";
      await updateMessage(conversationId, assistantId, { status: "error", ...(useAIChatStore.getState().conversations.find(item => item.id === conversationId)?.messages.find(item => item.id === assistantId)?.content ? {} : { content: message }) });
      setError(message);
    } finally { running.current = false; setIsStreaming(false); }
  }, [addMessage, conversationId, updateMessage]);

  useEffect(() => {
    if (!hydrated || !conversation || !conversationId || handledInitial.current === conversationId || running.current) return;
    const last = conversation.messages.at(-1);
    if (last?.role === "user") { handledInitial.current = conversationId; void send(last.content, last.attachments); }
  }, [conversation, conversationId, hydrated, send]);

  useEffect(() => {
    if (!hydrated || running.current || !conversationId) return;
    const message = useAIChatStore.getState().conversations.find(item => item.id === conversationId)?.messages.at(-1);
    if (message?.role !== "assistant" || message.status !== "streaming" || !message.runId) return;
    let stopped = false;
    running.current = true; setIsStreaming(true);
    void (async () => {
      try {
        const response = await fetch(`/api/ctx-app-agent/runs/${encodeURIComponent(message.runId!)}/events?after=0`, { cache: "no-store" });
        if (!response.ok || !response.body) throw new Error("This response can no longer be resumed. Retry the last message.");
        useAIChatStore.getState().setLocalMessage(conversationId, message.id, { content: "" });
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let content = ""; let completed = false;
        while (!stopped) {
          const part = await reader.read(); buffer += decoder.decode(part.value ?? new Uint8Array(), { stream: !part.done }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); const data = frame.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim();
            if (data) {
              const event = eventPayload(JSON.parse(data));
              if ((event.type === "tool.started" || event.type === "tool.finished") && typeof event.payload === "object" && event.payload !== null && "toolCall" in event.payload) { const parsedTool=aiWorkspaceToolCallSchema.safeParse(event.payload.toolCall); if(parsedTool.success){ const old=useAIChatStore.getState().conversations.find(item=>item.id===conversationId)?.messages.find(item=>item.id===message.id)?.toolCalls??[]; useAIChatStore.getState().setLocalMessage(conversationId,message.id,{toolCalls:[...old.filter(call=>call.id!==parsedTool.data.id),parsedTool.data]}); } }
              if (event.type === "text.delta" && typeof event.payload === "object" && event.payload !== null && "text" in event.payload && typeof event.payload.text === "string") { content += event.payload.text; useAIChatStore.getState().setLocalMessage(conversationId, message.id, { content }); }
              if (event.type === "run.completed" && typeof event.payload === "object" && event.payload !== null) { const result = ctxAgentResponseSchema.safeParse(event.payload); if (!result.success) throw new Error("The saved response was invalid."); await useAIChatStore.getState().updateMessage(conversationId, message.id, { ...result.data, status: "complete", runId: message.runId }); if (result.data.widgets?.length || result.data.artifactIds?.length) setArtifactOpen(true); completed = true; requestBackendSync(); }
              if (event.type === "run.failed" || event.type === "run.cancelled") { const detail = typeof event.payload === "object" && event.payload !== null && "error" in event.payload && typeof event.payload.error === "string" ? event.payload.error : "Response interrupted. Retry the request."; await useAIChatStore.getState().updateMessage(conversationId, message.id, { status: "error", ...(content ? {} : { content: detail }) }); if (!stopped) setError(detail); completed = true; }
            }
            boundary = buffer.indexOf("\n\n");
          }
          if (part.done) break;
        }
        if (!completed && !stopped) throw new Error("The saved response stream ended before completion.");
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "Response recovery failed.";
        await useAIChatStore.getState().updateMessage(conversationId, message.id, { status: "error", ...(message.content ? {} : { content: detail }) }).catch(() => {});
        if (!stopped) setError(detail);
      } finally { running.current = false; if (!stopped) setIsStreaming(false); }
    })();
    return () => { stopped = true; };
  }, [conversationId, hydrated]);

  const latestAssistant = useMemo(() => conversation?.messages.filter(message => message.role === "assistant").at(-1), [conversation?.messages]);
  const activeArtifact = artifacts.find(artifact => artifact.id === activeArtifactId) ?? artifacts[0];
  const activeArtifactFiles = activeArtifact?.version?.files ?? [];
  useEffect(() => {
    const container = transcriptRef.current;
    if (!container) return;
    if (forceTranscriptFollow.current || followTranscript.current) container.scrollTo({top:container.scrollHeight,behavior:"auto"});
    forceTranscriptFollow.current = false;
  }, [conversation?.messages.length, latestAssistant?.content]);
  useEffect(() => {
    if (!latestAssistant?.id || !latestAssistant.widgets?.length) return;
    if (latestAssistant.status !== "streaming") return;
    if (wavedWidgetMessageIdsRef.current.has(latestAssistant.id)) return;
    wavedWidgetMessageIdsRef.current.add(latestAssistant.id);
    triggerFullScreenGenerativeWave();
  }, [latestAssistant?.id, latestAssistant?.status, latestAssistant?.widgets?.length]);
  const openArtifactVersion = async (artifactId: string, version?: number) => {
    const response = await fetch(`/api/ai-workspace/artifacts/${encodeURIComponent(artifactId)}${version ? `?version=${version}` : ""}`, {cache:"no-store"});
    const value: unknown = await response.json(); if (!response.ok || typeof value !== "object" || value === null || !("artifact" in value)) return;
    const parsed = aiWorkspaceArtifactSchema.safeParse(value.artifact); if (!parsed.success) return;
    setArtifacts(current => [parsed.data, ...current.filter(item => item.id !== artifactId)]); setActiveArtifactId(artifactId);
  };
  const copyArtifactCode = async () => { if (activeArtifactFiles.length) await navigator.clipboard.writeText(activeArtifactFiles.map(file => file.content).join("\n\n")); };
  const downloadArtifactCode = () => {
    const file = activeArtifactFiles[0]; if (!file) return;
    const url = URL.createObjectURL(new Blob([file.content], {type:"text/plain;charset=utf-8"})); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.path.split("/").at(-1) ?? "artifact.txt"; anchor.click(); URL.revokeObjectURL(url);
  };
  const copyMessageMarkdown = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(current => (current === messageId ? null : current)), 1600);
    } catch {}
  };
  const exportConversationMarkdown = () => {
    if (!conversation) return;
    const body = conversation.messages
      .map(m => `## ${m.role === "user" ? "User" : "Assistant"}\n\n${m.content}`)
      .join("\n\n---\n\n");
    const markdown = `# ${conversation.title}\n\n${body}\n`;
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${conversation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chat"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const hasArtifact = Boolean(conversation?.messages.some(message => message.widgets?.length || message.artifactIds?.length));
  const upload = async (files: File[]) => {
    for (const file of files) {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/documents", { method: "POST", body: form }); const result: unknown = await response.json(); const body = eventPayload(result);
      if (!response.ok || typeof body.id !== "string") throw new Error(typeof body.error === "string" ? body.error : "Document upload failed.");
      setAttachments(previous => [...previous, { id: body.id as string, name: typeof body.originalName === "string" ? body.originalName : file.name }]);
    }
    requestBackendSync();
  };

  if (!hydrated) return <Layout height="fill" content={<LayoutContent><Text>Loading chats…</Text></LayoutContent>} />;
  if (!conversation) return <Layout height="fill" content={<LayoutContent><VStack gap={3}><Text>Choose a chat or start from Mission Control.</Text><Button label="Mission Control" size="sm" variant="secondary" onClick={onMissionControl} /></VStack></LayoutContent>} />;
  return <HStack height="100%" style={{ minHeight: 0, width: "100%", background: "var(--background)" }}>
    <VStack gap={0} style={{ display: artifactOpen && isMobile ? "none" : undefined, flex: 1, minWidth: 0, maxWidth: artifactOpen ? undefined : 920, marginInline: artifactOpen ? 0 : "auto", height: "100%" }}>
      <HStack gap={3} style={{ padding: 16, borderBottom: "1px solid var(--border)" }} vAlign="center">
        <Button label="Mission Control" size="sm" variant="ghost" onClick={onMissionControl} />
        <Text weight="semibold" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conversation.title}</Text>
        {isStreaming && <><ChatThinkingStatus size={20} state={latestAssistant?.widgets?.length ? "working" : latestAssistant?.toolCalls?.length ? "searching" : "composing"} label={latestAssistant?.widgets?.length ? "Building UI…" : latestAssistant?.toolCalls?.length ? "Running tools…" : "Generating…"} /><Button label="Stop" size="sm" variant="secondary" onClick={() => { const runId = useAIChatStore.getState().conversations.find(item => item.id === conversationId)?.messages.at(-1)?.runId; if (runId) void fetch(`/api/ctx-app-agent/runs/${encodeURIComponent(runId)}/cancel`, {method:"POST"}).then(() => requestBackendSync()); }} /></>}
        {hasArtifact && !artifactOpen && <Button label="Open workspace" size="sm" variant="secondary" onClick={() => { triggerFullScreenGenerativeWave(); setArtifactOpen(true); }} />}
        <Button
          label="Export"
          icon={<Download size={14} />}
          size="sm"
          variant="ghost"
          onClick={exportConversationMarkdown}
        />
        <Button
          label="Delete chat"
          icon={<Trash2 size={14} />}
          size="sm"
          variant="destructive"
          onClick={() => setDeleteDialogOpen(true)}
        />
      </HStack>
      <ChatMessageList ref={transcriptRef} isStreaming={isStreaming} onScroll={() => { const container = transcriptRef.current; if (container) followTranscript.current = container.scrollHeight - container.scrollTop - container.clientHeight < 80; }} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20 }}>
        {conversation.messages.map((message, messageIndex) => {
          const previousUserPrompt = message.role === "assistant"
            ? conversation.messages.slice(0, messageIndex).reverse().find(m => m.role === "user")?.content
            : undefined;
          return <ChatMessage key={message.id} sender={message.role}>
          {message.attachments?.length ? <HStack gap={1} wrap="wrap">{message.attachments.map(file => <Token key={file.id} label={file.name} />)}</HStack> : null}
          <ChatMessageBubble variant={message.role === "assistant" ? "ghost" : undefined}>
            {message.role === "assistant" ? (message.content ? <Markdown density="compact" isStreaming={message.status === "streaming"}>{message.content}</Markdown> : message.status === "streaming" ? <ChatThinkingStatus size={64} state={message.toolCalls?.length ? "searching" : "composing"} label="Thinking…" /> : <Markdown density="compact">{""}</Markdown>) : <Markdown density="compact">{message.content}</Markdown>}
          </ChatMessageBubble>
          {message.toolCalls?.length ? <ChatToolCalls defaultIsExpanded calls={message.toolCalls.map(call => ({ name: call.name, input: call.target, output: call.errorMessage ?? call.result ?? call.status }))} /> : null}
          {message.widgets?.map((widget, index) => renderWidget(widget, `${message.id}-${index}`))}
          {message.citations?.length ? <HStack gap={1.5} wrap="wrap" style={{ marginTop: 8 }}>{message.citations.map(citation => <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 6, background: "var(--secondary)", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: 11, textDecoration: "none" }}>{citation.title}</a>)}</HStack> : null}
          {message.content && message.status !== "streaming" && (
            <HStack gap={1} style={{ marginTop: 4 }}>
              <Button
                label={copiedMessageId === message.id ? "Copied" : "Copy"}
                icon={copiedMessageId === message.id ? <Check size={12} /> : <Copy size={12} />}
                size="sm"
                variant="ghost"
                onClick={() => void copyMessageMarkdown(message.id, message.content)}
              />
              {message.role === "assistant" && previousUserPrompt && !isStreaming && (
                <Button
                  label="Regenerate"
                  icon={<RotateCcw size={12} />}
                  size="sm"
                  variant="ghost"
                  onClick={() => void send(previousUserPrompt, [])}
                />
              )}
            </HStack>
          )}
          {message.status === "error" && <Text type="supporting" color="secondary">Response interrupted. Submit a new message to retry.</Text>}
        </ChatMessage>;
        })}
      </ChatMessageList>
      {error && <Text role="alert" style={{ paddingInline: 16 }}>{error}</Text>}
      <div
        style={{ width: "100%" }}
        onFocus={() => setIsComposerFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsComposerFocused(false);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) void upload(files).catch(cause => setError(cause instanceof Error ? cause.message : "Upload failed."));
            event.target.value = "";
          }}
        />
        <ChatComposerFx isFocused={isComposerFocused} isListening={dictation.isListening} voiceLevel={dictation.volume} borderRadius={16}>
          <ChatComposer
            onSubmit={text => { void send(text, attachments); setAttachments([]); }}
            isDisabled={isStreaming}
            placeholder="Message CTX App Agent…"
            input={<ChatComposerInput handleRef={inputRef} onFiles={files => { void upload(files).catch(cause => setError(cause instanceof Error ? cause.message : "Upload failed.")); }} />}
            drawer={attachments.length ? <ChatComposerDrawer count={attachments.length}>{attachments.map(file => <Token key={file.id} label={file.name} onRemove={() => setAttachments(previous => previous.filter(item => item.id !== file.id))} />)}</ChatComposerDrawer> : undefined}
            footerActions={
              <>
                <ModelSelectorPopover />
                <DropdownMenu
                  button={{
                    label: "File",
                    variant: "ghost",
                    size: "sm",
                    icon: <Icon icon={PlusIcon} size="sm" />,
                    children: "File",
                  }}
                  hasChevron={false}
                  menuWidth={220}
                  items={[
                    {
                      label: "Upload or add files",
                      icon: PaperClipIcon,
                      isDisabled: isStreaming,
                      onClick: () => fileInputRef.current?.click(),
                    },
                    {
                      label: "Documents & Sources",
                      icon: FolderIcon,
                      onClick: () => useGraphStore.getState().setViewMode("sources"),
                    },
                    ...(attachments.length > 0
                      ? [
                          { type: "divider" as const },
                          {
                            label: `Clear attachments (${attachments.length})`,
                            onClick: () => setAttachments([]),
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            }
            sendActions={<ChatDictationButton dictation={dictation} />}
          />
        </ChatComposerFx>
      </div>
    </VStack>
    {artifactOpen && <>
      {!isMobile && <ResizeHandle resizable={artifactPanel.props} />}
      <VStack gap={3} style={{ flex: isMobile ? "1 1 100%" : `0 0 ${artifactPanel.size}px`, width: isMobile ? "100%" : artifactPanel.size, minWidth: isMobile ? 0 : 280, maxWidth: isMobile ? "100%" : "65vw", height: "100%", overflow: "auto", borderLeft: "1px solid var(--border)", padding: 16 }}>
        <HStack gap={2} vAlign="center"><Text weight="semibold">Workspace</Text><Button label="Expand" size="sm" variant="ghost" onClick={() => artifactPanel.resize(isMobile ? window.innerWidth : 900)} /><Button label="Close" size="sm" variant="ghost" onClick={() => setArtifactOpen(false)} /></HStack>
        {artifacts.length > 0 && <HStack gap={2} wrap="wrap">{artifacts.map(artifact => <Button key={artifact.id} label={artifact.title} size="sm" variant="secondary" onClick={() => { setActiveArtifactId(artifact.id); setArtifactTab("code"); }} />)}</HStack>}
        <TabList value={artifactTab} onChange={setArtifactTab} size="sm" aria-label="Artifact view"><Tab value="preview" label="Preview" /><Tab value="code" label="Code" /></TabList>
        {activeArtifact && activeArtifact.currentVersion > 1 && <HStack gap={1} wrap="wrap">{Array.from({length:activeArtifact.currentVersion}, (_,index) => index+1).map(version => <Button key={version} label={version === activeArtifact.currentVersion ? `Current v${version}` : `v${version}`} size="sm" variant="ghost" onClick={() => void openArtifactVersion(activeArtifact.id, version)} />)}</HStack>}
        {artifactTab === "preview" ? <>
          {activeArtifact && (activeArtifact.type === "react-ui" || activeArtifact.type === "code") && (
            <HStack gap={1} vAlign="center">
              <Button label="Desktop" size="sm" variant={previewViewport === "desktop" ? "secondary" : "ghost"} onClick={() => setPreviewViewport("desktop")} />
              <Button label="Tablet" size="sm" variant={previewViewport === "tablet" ? "secondary" : "ghost"} onClick={() => setPreviewViewport("tablet")} />
              <Button label="Mobile" size="sm" variant={previewViewport === "mobile" ? "secondary" : "ghost"} onClick={() => setPreviewViewport("mobile")} />
            </HStack>
          )}
          {latestAssistant?.widgets?.map((widget, index) => renderWidget(widget, `artifact-${index}`))}
          {activeArtifact?.type === "document" ? activeArtifactFiles.map(file => <Markdown key={`${activeArtifact.id}-${file.path}`} density="compact">{file.content}</Markdown>) : activeArtifact?.type === "structured-ui" && activeArtifact.version?.spec ? renderWidget(activeArtifact.version.spec as GenerativeWidgetPayload, activeArtifact.id) : activeArtifact && (activeArtifact.type === "react-ui" || activeArtifact.type === "code") ? (
            <div style={{ width: previewViewport === "desktop" ? "100%" : previewViewport === "tablet" ? "768px" : "390px", maxWidth: "100%", marginInline: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
              <ArtifactPreviewPanel artifact={activeArtifact} />
            </div>
          ) : null}
        </> : <>
          {activeArtifactFiles.length > 0 && <HStack gap={1}><Button label="Copy" size="sm" variant="secondary" onClick={() => void copyArtifactCode()} /><Button label="Download" size="sm" variant="secondary" onClick={downloadArtifactCode} /></HStack>}
          {activeArtifactFiles.map(file => <CodeBlock key={`${activeArtifact?.id}-${file.path}`} code={file.content} language={file.language} container="section" hasLineNumbers size="sm" />)}
        </>}
      </VStack>
    </>}
    <Dialog
      isOpen={deleteDialogOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isDeletingChat) setDeleteDialogOpen(false);
      }}
      purpose="form"
      width={400}
    >
      <DialogHeader
        title="Delete Chat"
        subtitle={`Are you sure you want to delete "${conversation.title}"? All messages and generated artifacts in this conversation will be permanently removed.`}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isDeletingChat) setDeleteDialogOpen(false);
        }}
        startContent={<Trash2 size={18} style={{ color: "var(--color-status-error, #f87171)" }} />}
      />
      <div style={{ padding: "16px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <Button
          size="sm"
          variant="secondary"
          label="Cancel"
          isDisabled={isDeletingChat}
          onClick={() => setDeleteDialogOpen(false)}
        />
        <Button
          size="sm"
          variant="destructive"
          label={isDeletingChat ? "Deleting..." : "Delete Chat"}
          isDisabled={isDeletingChat}
          onClick={async () => {
            setIsDeletingChat(true);
            try {
              await useAIChatStore.getState().removeConversation(conversation.id);
              setDeleteDialogOpen(false);
              onMissionControl();
            } finally {
              setIsDeletingChat(false);
            }
          }}
        />
      </div>
    </Dialog>
  </HStack>;
}
