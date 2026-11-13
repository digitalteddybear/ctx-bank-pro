import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { z } from "zod";
import {
  aiWorkspaceArtifactSchema, aiWorkspaceArtifactVersionSchema, aiWorkspaceConversationSchema,
  aiWorkspaceEventSchema, aiWorkspaceMessageSchema, aiWorkspaceSourceReferenceSchema,
  type AIWorkspaceArtifact, type AIWorkspaceArtifactVersion, type AIWorkspaceConversation,
  type AIWorkspaceEvent, type AIWorkspaceMessage,
} from "@/lib/ai-workspace-contract";

const now = () => new Date().toISOString();
const parseJson = <T>(value: unknown, schema: z.ZodType<T>): T => schema.parse(JSON.parse(String(value)));
const databasePath = () => process.env.CTX_AI_WORKSPACE_DB_PATH ?? path.join(process.cwd(), "data/generated/ai-workspace/workspace.sqlite");

export class AIWorkspaceError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export class AIWorkspaceConflict extends AIWorkspaceError {
  constructor(message = "This artifact changed in another edit. Reload the latest version and retry.") { super(message, 409); }
}

type RunRow = { id: string; requestId: string; conversationId: string; assistantMessageId: string; status: string; error: string | null; };

export class AIWorkspaceStore {
  readonly db: DatabaseSync;
  readonly workspaceId: string;
  constructor(filename = databasePath()) {
    if (filename !== ":memory:") {
      const directory = path.dirname(filename);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700);
    }
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE INDEX IF NOT EXISTS conversations_updated ON conversations(deleted_at, updated_at DESC);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(conversation_id, sequence));
      CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages(conversation_id, sequence);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, conversation_id TEXT NOT NULL REFERENCES conversations(id), assistant_message_id TEXT NOT NULL, status TEXT NOT NULL, error TEXT, next_sequence INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS runs_by_conversation ON runs(conversation_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS run_events (event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, event_type TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(run_id, sequence));
      CREATE INDEX IF NOT EXISTS run_events_sequence ON run_events(run_id, sequence);
      CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id), title TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, current_version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS artifacts_conversation ON artifacts(conversation_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS artifact_versions (artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE, version INTEGER NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(artifact_id, version));
      CREATE TABLE IF NOT EXISTS source_records (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, CURRENT_TIMESTAMP);`);
    const savedId = this.db.prepare("SELECT value FROM workspace_meta WHERE key='workspace_id'").get() as { value?: string } | undefined;
    this.workspaceId = savedId?.value ?? randomUUID();
    this.db.prepare("INSERT OR IGNORE INTO workspace_meta(key,value) VALUES ('workspace_id',?)").run(this.workspaceId);
    this.recoverInterruptedRuns();
  }

  private transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private getMessageRows(conversationId: string): AIWorkspaceMessage[] {
    return (this.db.prepare("SELECT data_json FROM messages WHERE conversation_id=? ORDER BY sequence").all(conversationId) as { data_json: string }[])
      .map(row => parseJson(row.data_json, aiWorkspaceMessageSchema));
  }

  getConversation(id: string): AIWorkspaceConversation | null {
    const row = this.db.prepare("SELECT data_json, created_at, updated_at FROM conversations WHERE id=? AND workspace_id=? AND deleted_at IS NULL").get(id, this.workspaceId) as { data_json: string; created_at: string; updated_at: string } | undefined;
    if (!row) return null;
    const meta = JSON.parse(row.data_json) as { title: string };
    return aiWorkspaceConversationSchema.parse({ id, title: meta.title, createdAt: row.created_at, updatedAt: row.updated_at, messages: this.getMessageRows(id) });
  }

  listConversations(limit = 100): AIWorkspaceConversation[] {
    const rows = this.db.prepare("SELECT id FROM conversations WHERE workspace_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(this.workspaceId, Math.max(1, Math.min(limit, 100))) as { id: string }[];
    return rows.flatMap(row => { const conversation = this.getConversation(row.id); return conversation ? [conversation] : []; });
  }

  importConversations(conversations: AIWorkspaceConversation[]): { imported: number; existing: number } {
    let imported = 0; let existing = 0;
    this.transaction(() => {
      const insertConversation = this.db.prepare("INSERT OR IGNORE INTO conversations(id,workspace_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?)");
      const insertMessage = this.db.prepare("INSERT OR IGNORE INTO messages(id,conversation_id,sequence,data_json,created_at) VALUES (?,?,?,?,?)");
      for (const candidate of conversations) {
        const conversation = aiWorkspaceConversationSchema.parse(candidate);
        const result = insertConversation.run(conversation.id, this.workspaceId, JSON.stringify({ title: conversation.title }), conversation.createdAt, conversation.updatedAt);
        if (Number(result.changes) === 0) { existing++; continue; }
        conversation.messages.forEach((message, index) => insertMessage.run(message.id, conversation.id, index + 1, JSON.stringify(message), message.createdAt));
        imported++;
      }
    });
    return { imported, existing };
  }

  createConversation(conversation: AIWorkspaceConversation): AIWorkspaceConversation {
    const parsed = aiWorkspaceConversationSchema.parse(conversation);
    this.transaction(() => {
      this.db.prepare("INSERT INTO conversations(id,workspace_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?)").run(parsed.id, this.workspaceId, JSON.stringify({ title: parsed.title }), parsed.createdAt, parsed.updatedAt);
      const insert = this.db.prepare("INSERT INTO messages(id,conversation_id,sequence,data_json,created_at) VALUES (?,?,?,?,?)");
      parsed.messages.forEach((message, index) => insert.run(message.id, parsed.id, index + 1, JSON.stringify(message), message.createdAt));
    });
    return parsed;
  }

  appendMessage(conversationId: string, raw: AIWorkspaceMessage): AIWorkspaceMessage {
    const message = aiWorkspaceMessageSchema.parse(raw);
    this.transaction(() => {
      const exists = this.db.prepare("SELECT 1 AS found FROM conversations WHERE id=? AND workspace_id=? AND deleted_at IS NULL").get(conversationId, this.workspaceId);
      if (!exists) throw new AIWorkspaceError("Chat not found.", 404);
      const sequence = this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS next FROM messages WHERE conversation_id=?").get(conversationId) as { next: number };
      this.db.prepare("INSERT INTO messages(id,conversation_id,sequence,data_json,created_at) VALUES (?,?,?,?,?)").run(message.id, conversationId, sequence.next, JSON.stringify(message), message.createdAt);
      this.db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(now(), conversationId);
    });
    return message;
  }

  updateMessage(conversationId: string, messageId: string, update: Partial<AIWorkspaceMessage>): AIWorkspaceMessage {
    const parent = this.db.prepare("SELECT 1 AS found FROM conversations WHERE id=? AND workspace_id=? AND deleted_at IS NULL").get(conversationId, this.workspaceId);
    if (!parent) throw new AIWorkspaceError("Chat not found.", 404);
    const row = this.db.prepare("SELECT data_json FROM messages WHERE id=? AND conversation_id=?").get(messageId, conversationId) as { data_json: string } | undefined;
    if (!row) throw new AIWorkspaceError("Chat message not found.", 404);
    const previous = parseJson(row.data_json, aiWorkspaceMessageSchema);
    const message = aiWorkspaceMessageSchema.parse({ ...previous, ...update });
    this.db.prepare("UPDATE messages SET data_json=? WHERE id=? AND conversation_id=?").run(JSON.stringify(message), messageId, conversationId);
    this.db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(now(), conversationId);
    return message;
  }

  updateConversationTitle(id: string, title: string): AIWorkspaceConversation {
    const result = this.db.prepare("UPDATE conversations SET data_json=?,updated_at=? WHERE id=? AND workspace_id=? AND deleted_at IS NULL").run(JSON.stringify({ title }), now(), id, this.workspaceId);
    if (Number(result.changes) !== 1) throw new AIWorkspaceError("Chat not found.", 404);
    const conversation = this.getConversation(id);
    if (!conversation) throw new AIWorkspaceError("Chat not found.", 404);
    return conversation;
  }

  deleteConversation(id: string): void {
    const result = this.db.prepare("UPDATE conversations SET deleted_at=?,updated_at=? WHERE id=? AND workspace_id=? AND deleted_at IS NULL").run(now(), now(), id, this.workspaceId);
    if (Number(result.changes) === 0) throw new AIWorkspaceError("Chat not found.", 404);
  }

  createRun(input: { id: string; requestId: string; conversationId: string; assistantMessageId: string }): { run: RunRow; created: boolean } {
    const current = this.db.prepare("SELECT id,request_id AS requestId,conversation_id AS conversationId,assistant_message_id AS assistantMessageId,status,error FROM runs WHERE request_id=?").get(input.requestId) as RunRow | undefined;
    if (current) return { run: current, created: false };
    this.db.prepare("INSERT INTO runs(id,request_id,conversation_id,assistant_message_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(input.id, input.requestId, input.conversationId, input.assistantMessageId, "running", now(), now());
    return { run: { id: input.id, requestId: input.requestId, conversationId: input.conversationId, assistantMessageId: input.assistantMessageId, status: "running", error: null }, created: true };
  }

  appendRunEvent(runId: string, conversationId: string, type: AIWorkspaceEvent["type"], payload: Record<string, unknown>, artifactId?: string, artifactVersion?: number): AIWorkspaceEvent {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT next_sequence AS sequence FROM runs WHERE id=? AND conversation_id=?").get(runId, conversationId) as { sequence: number } | undefined;
      if (!row) throw new AIWorkspaceError("Run not found.", 404);
      const event = aiWorkspaceEventSchema.parse({ eventId: randomUUID(), schemaVersion: 1, runId, conversationId, ...(artifactId ? { artifactId } : {}), ...(artifactVersion ? { artifactVersion } : {}), sequence: row.sequence, timestamp: now(), type, payload });
      this.db.prepare("INSERT INTO run_events(event_id,run_id,sequence,event_type,data_json,created_at) VALUES (?,?,?,?,?,?)").run(event.eventId, runId, event.sequence, type, JSON.stringify(event), event.timestamp);
      const terminal = type === "run.completed" || type === "run.failed" || type === "run.cancelled";
      this.db.prepare("UPDATE runs SET next_sequence=?,status=?,error=?,updated_at=? WHERE id=?").run(row.sequence + 1, terminal ? type.slice(4) : "running", type === "run.failed" && typeof payload.error === "string" ? payload.error : null, event.timestamp, runId);
      return event;
    });
  }

  eventsAfter(runId: string, sequence: number): AIWorkspaceEvent[] {
    return (this.db.prepare("SELECT data_json FROM run_events WHERE run_id=? AND sequence>? ORDER BY sequence").all(runId, sequence) as { data_json: string }[])
      .map(row => parseJson(row.data_json, aiWorkspaceEventSchema));
  }

  getRun(runId: string): (RunRow & { nextSequence: number }) | null {
    const row = this.db.prepare("SELECT id,request_id AS requestId,conversation_id AS conversationId,assistant_message_id AS assistantMessageId,status,error,next_sequence AS nextSequence FROM runs WHERE id=?").get(runId) as (RunRow & { nextSequence: number }) | undefined;
    return row ?? null;
  }

  private recoverInterruptedRuns() {
    const rows = this.db.prepare("SELECT id,conversation_id AS conversationId,assistant_message_id AS assistantMessageId FROM runs WHERE status='running'").all() as { id: string; conversationId: string; assistantMessageId: string }[];
    for (const run of rows) {
      const interrupted = "The CTX process restarted before this response finished. Retry to continue.";
      try { this.updateMessage(run.conversationId, run.assistantMessageId, { status: "error", ...(this.messageContent(run.assistantMessageId) ? {} : { content: interrupted }) }); } catch { /* A deleted or migrated message does not block workspace recovery. */ }
      this.appendRunEvent(run.id, run.conversationId, "run.failed", { error: interrupted, code: "process_restarted" });
    }
  }

  private messageContent(messageId: string): string {
    const row = this.db.prepare("SELECT data_json FROM messages WHERE id=?").get(messageId) as { data_json: string } | undefined;
    return row ? parseJson(row.data_json, aiWorkspaceMessageSchema).content : "";
  }

  createArtifact(raw: Omit<AIWorkspaceArtifact, "workspaceId" | "currentVersion" | "createdAt" | "updatedAt"> & { version: AIWorkspaceArtifactVersion }): AIWorkspaceArtifact {
    const createdAt = now();
    const version = aiWorkspaceArtifactVersionSchema.parse({ ...raw.version, artifactId: raw.id, version: 1, createdAt });
    const artifact = aiWorkspaceArtifactSchema.parse({ ...raw, workspaceId: this.workspaceId, currentVersion: 1, createdAt, updatedAt: createdAt, version });
    if (artifact.type === "structured-ui" ? !version.spec || version.files.length !== 0 : !version.files.length || Boolean(version.spec)) throw new AIWorkspaceError("Artifact content does not match its type.", 400);
    this.transaction(() => {
      if (!this.getConversation(raw.conversationId)) throw new AIWorkspaceError("Chat not found.", 404);
      this.db.prepare("INSERT INTO artifacts(id,workspace_id,conversation_id,title,type,status,current_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(artifact.id, this.workspaceId, artifact.conversationId, artifact.title, artifact.type, artifact.status, 1, createdAt, createdAt);
      this.db.prepare("INSERT INTO artifact_versions(artifact_id,version,data_json,created_at) VALUES (?,?,?,?)").run(artifact.id, 1, JSON.stringify(version), createdAt);
    });
    return artifact;
  }

  getArtifact(id: string, versionNumber?: number): AIWorkspaceArtifact | null {
    const row = this.db.prepare("SELECT id,workspace_id AS workspaceId,conversation_id AS conversationId,title,type,status,current_version AS currentVersion,created_at AS createdAt,updated_at AS updatedAt FROM artifacts WHERE id=? AND workspace_id=?").get(id, this.workspaceId) as Omit<AIWorkspaceArtifact, "version"> | undefined;
    if (!row) return null;
    const version = versionNumber ?? row.currentVersion;
    const versionRow = this.db.prepare("SELECT data_json FROM artifact_versions WHERE artifact_id=? AND version=?").get(id, version) as { data_json: string } | undefined;
    if (!versionRow) throw new AIWorkspaceError("Artifact version not found.", 404);
    return aiWorkspaceArtifactSchema.parse({ ...row, version: parseJson(versionRow.data_json, aiWorkspaceArtifactVersionSchema) });
  }

  listArtifacts(conversationId: string): AIWorkspaceArtifact[] {
    const rows = this.db.prepare("SELECT id FROM artifacts WHERE workspace_id=? AND conversation_id=? ORDER BY updated_at DESC").all(this.workspaceId, conversationId) as { id: string }[];
    return rows.flatMap(row => { const artifact = this.getArtifact(row.id); return artifact ? [artifact] : []; });
  }

  updateArtifact(id: string, baseVersion: number, change: { title?: string; files?: AIWorkspaceArtifactVersion["files"]; spec?: AIWorkspaceArtifactVersion["spec"]; sourceReferences?: z.infer<typeof aiWorkspaceSourceReferenceSchema>[]; provenance: AIWorkspaceArtifactVersion["provenance"] }): AIWorkspaceArtifact {
    const current = this.getArtifact(id);
    if (!current?.version) throw new AIWorkspaceError("Artifact not found.", 404);
    if (current.currentVersion !== baseVersion) throw new AIWorkspaceConflict();
    const { title: _title, ...versionChange } = change;
    const candidate = { ...current.version, ...versionChange, artifactId: id, version: baseVersion + 1, createdAt: now() };
    const validatedVersion = aiWorkspaceArtifactVersionSchema.safeParse(candidate);
    if (!validatedVersion.success) throw new AIWorkspaceError(`Invalid artifact version: ${validatedVersion.error.issues.map(issue => issue.path.join(".") + " " + issue.message).join("; ")}`, 400);
    const version = validatedVersion.data;
    if (current.type === "structured-ui" ? !version.spec || version.files.length !== 0 : !version.files.length || Boolean(version.spec)) throw new AIWorkspaceError("Artifact content does not match its type.", 400);
    const updatedAt = now();
    this.transaction(() => {
      const result = this.db.prepare("UPDATE artifacts SET title=?,current_version=?,updated_at=? WHERE id=? AND workspace_id=? AND current_version=?").run(change.title ?? current.title, version.version, updatedAt, id, this.workspaceId, baseVersion);
      if (Number(result.changes) !== 1) throw new AIWorkspaceConflict();
      this.db.prepare("INSERT INTO artifact_versions(artifact_id,version,data_json,created_at) VALUES (?,?,?,?)").run(id, version.version, JSON.stringify(version), version.createdAt);
    });
    return aiWorkspaceArtifactSchema.parse({ ...current, title: change.title ?? current.title, currentVersion: version.version, updatedAt, version });
  }

  restoreArtifact(id: string, sourceVersion: number, provenance: AIWorkspaceArtifactVersion["provenance"]): AIWorkspaceArtifact {
    const current = this.getArtifact(id);
    const source = this.getArtifact(id, sourceVersion)?.version;
    if (!current?.version || !source) throw new AIWorkspaceError("Artifact version not found.", 404);
    if (current.currentVersion !== sourceVersion && current.currentVersion < sourceVersion) throw new AIWorkspaceConflict();
    return this.updateArtifact(id, current.currentVersion, { title: current.title, files: source.files, spec: source.spec, sourceReferences: source.sourceReferences, provenance });
  }

  archiveArtifact(id: string): void {
    const result = this.db.prepare("UPDATE artifacts SET status='archived',updated_at=? WHERE id=? AND workspace_id=?").run(now(), id, this.workspaceId);
    if (Number(result.changes) !== 1) throw new AIWorkspaceError("Artifact not found.", 404);
  }

  saveSources(sources: z.infer<typeof aiWorkspaceSourceReferenceSchema>[]): z.infer<typeof aiWorkspaceSourceReferenceSchema>[] {
    const insert = this.db.prepare("INSERT OR IGNORE INTO source_records(id,workspace_id,data_json,created_at) VALUES (?,?,?,?)");
    for (const raw of sources) {
      const source = aiWorkspaceSourceReferenceSchema.parse(raw);
      insert.run(source.id, this.workspaceId, JSON.stringify(source), source.retrievedAt ?? now());
    }
    return sources.map(source => aiWorkspaceSourceReferenceSchema.parse(source));
  }

  close() { this.db.close(); }
}

const g = globalThis as typeof globalThis & { __ctxAIWorkspaceStore?: AIWorkspaceStore };
export function aiWorkspaceStore() { g.__ctxAIWorkspaceStore ??= new AIWorkspaceStore(); return g.__ctxAIWorkspaceStore; }
export function hashWorkspacePrompt(prompt: string) { return createHash("sha256").update(prompt).digest("hex"); }
