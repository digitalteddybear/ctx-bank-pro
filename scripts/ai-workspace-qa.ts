import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AIWorkspaceConflict, AIWorkspaceError, AIWorkspaceStore } from "../src/lib/server/ai-workspace-store";
import { ArtifactPreviewError, compileArtifactPreview } from "../src/lib/server/ai-artifact-preview";
import { AppEditorDraftError, appEditorDraftRepository } from "../src/lib/server/app-editor-drafts";

const timestamp = "2026-11-02T00:00:00.000Z";
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ctx-ai-workspace-"));
  const store = new AIWorkspaceStore(path.join(root, "workspace.sqlite"));
  const chat = store.createConversation({ id: crypto.randomUUID(), title: "Durable chat", createdAt: timestamp, updatedAt: timestamp, messages: [
    { id: crypto.randomUUID(), role: "user", content: "Create a document", createdAt: timestamp, status: "complete" },
    { id: crypto.randomUUID(), role: "assistant", content: "", createdAt: timestamp, status: "streaming" },
  ] });
  return { root, store, chat };
}

test("workspace persists chat history and imports local history idempotently", () => {
  const { root, store, chat } = fixture();
  try {
    assert.equal(store.importConversations([chat]).existing, 1);
    assert.equal(store.listConversations()[0]?.messages.length, 2);
    store.close();
    const reopened = new AIWorkspaceStore(path.join(root, "workspace.sqlite"));
    assert.equal(reopened.getConversation(chat.id)?.title, "Durable chat");
    reopened.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("workspace soft-deletes conversations cleanly", () => {
  const { root, store, chat } = fixture();
  try {
    assert.equal(store.listConversations().length, 1);
    store.deleteConversation(chat.id);
    assert.equal(store.listConversations().length, 0);
    assert.equal(store.getConversation(chat.id), null);
    assert.throws(() => store.deleteConversation(chat.id), AIWorkspaceError);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("run events are ordered and request IDs are idempotent", () => {
  const { root, store, chat } = fixture();
  try {
    const requestId = crypto.randomUUID();
    const run = store.createRun({ id: requestId, requestId, conversationId: chat.id, assistantMessageId: chat.messages[1]!.id });
    assert.equal(run.created, true);
    assert.equal(store.createRun({ id: crypto.randomUUID(), requestId, conversationId: chat.id, assistantMessageId: chat.messages[1]!.id }).created, false);
    store.appendRunEvent(run.run.id, chat.id, "run.started", {});
    store.appendRunEvent(run.run.id, chat.id, "text.delta", { text: "hello" });
    store.appendRunEvent(run.run.id, chat.id, "run.completed", { text: "hello" });
    assert.deepEqual(store.eventsAfter(run.run.id, 1).map(event => event.sequence), [2, 3]);
    assert.equal(store.getRun(run.run.id)?.status, "completed");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("artifact updates use immutable versions and reject stale edits", () => {
  const { root, store, chat } = fixture();
  const runId = crypto.randomUUID();
  const provenance = { provider: "test", model: "fixture", runId, createdAt: timestamp, promptHash: "a".repeat(64) };
  try {
    const artifact = store.createArtifact({ id: crypto.randomUUID(), conversationId: chat.id, title: "Notes", type: "document", status: "draft", version: {
      artifactId: "unused", version: 1, files: [{ path: "notes.md", language: "markdown", content: "First draft" }], sourceReferences: [], provenance, createdAt: timestamp,
    } });
    const revised = store.updateArtifact(artifact.id, 1, { files: [{ path: "notes.md", language: "markdown", content: "Reviewed draft" }], provenance });
    assert.equal(revised.currentVersion, 2);
    assert.equal(store.getArtifact(artifact.id, 1)?.version?.files[0]?.content, "First draft");
    assert.equal(store.restoreArtifact(artifact.id, 1, provenance).currentVersion, 3);
    assert.throws(() => store.updateArtifact(artifact.id, 1, { title: "Stale", provenance }), AIWorkspaceConflict);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});


test("React artifact compiler bundles inside the preview policy and rejects network imports", async () => {
  const { root, store, chat } = fixture();
  const provenance = { provider:"test", model:"fixture", runId:crypto.randomUUID(), createdAt:timestamp, promptHash:"b".repeat(64) };
  try {
    const artifact = store.createArtifact({ id:crypto.randomUUID(), conversationId:chat.id, title:"Preview", type:"react-ui", status:"ready", version:{artifactId:"unused",version:1,files:[{path:"App.tsx",language:"tsx",content:'import React from "react"; export default function App(){return <main>Sandbox test</main>}' }],sourceReferences:[],provenance,createdAt:timestamp} });
    const preview = await compileArtifactPreview(artifact);
    assert.ok(preview.javascript.length > 0, JSON.stringify(preview));
    assert.match(preview.javascript, /Sandbox test/);
    assert.equal(preview.sourceVersion, 1);
    const unsafe = store.createArtifact({ id:crypto.randomUUID(), conversationId:chat.id, title:"Unsafe", type:"react-ui", status:"ready", version:{artifactId:"unused",version:1,files:[{path:"App.tsx",language:"tsx",content:'import Evil from "https://example.invalid/evil.js"; export default Evil;' }],sourceReferences:[],provenance,createdAt:timestamp} });
    await assert.rejects(() => compileArtifactPreview(unsafe), ArtifactPreviewError);
  } finally { store.close(); rmSync(root, {recursive:true,force:true}); }
});


test("App Editor drafts stay separate from source and reject stale or disallowed paths", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ctx-app-drafts-"));
  try {
    mkdirSync(path.join(root,"src/components"),{recursive:true});
    writeFileSync(path.join(root,"src/components/Panel.tsx"),"export default function Panel(){return null;}\n");
    const repository=appEditorDraftRepository(root); const source=await repository.read("src/components/Panel.tsx");
    const saved=await repository.save(source.path,"export default function Panel(){return <main/>;}\n",source.baseHash,source.revision);
    assert.equal((await repository.read(source.path)).revision,saved.revision);
    await assert.rejects(()=>repository.save(source.path,"stale",source.baseHash,source.revision),AppEditorDraftError);
    await assert.rejects(()=>repository.read("src/app/api/secret/route.ts"),AppEditorDraftError);
    await assert.rejects(()=>repository.read("src/components/../../.env.local"),AppEditorDraftError);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
