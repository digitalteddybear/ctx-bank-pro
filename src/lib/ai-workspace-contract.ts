import { z } from "zod";
import { generativeWidgetPayloadSchema } from "@/lib/ctx-app-agent-contract";

const idSchema = z.string().min(1).max(200);
const timestampSchema = z.string().datetime({ offset: true });

export const aiWorkspaceCitationSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(500),
  url: z.string().url({protocol:/^https?$/}).optional(),
  kind: z.enum(["web", "document"]),
  retrievedAt: timestampSchema,
  documentId: z.string().optional(),
  chunkId: z.string().optional(),
  contentHash: z.string().optional(),
  startIndex: z.number().int().nonnegative().optional(),
  endIndex: z.number().int().nonnegative().optional(),
}).strict();
export type AIWorkspaceCitation = z.infer<typeof aiWorkspaceCitationSchema>;

export const aiWorkspaceAttachmentSchema = z.object({ id: z.string(), name: z.string() }).strict();
export const aiWorkspaceToolCallSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  target: z.string().max(1000),
  status: z.enum(["pending", "running", "complete", "error"]),
  duration: z.string().optional(),
  errorMessage: z.string().max(1000).optional(),
  result: z.string().max(20000).optional(),
}).strict();

export const aiWorkspaceMessageSchema = z.object({
  id: idSchema,
  role: z.enum(["user", "assistant"]),
  content: z.string().max(300000),
  createdAt: timestampSchema,
  status: z.enum(["complete", "streaming", "error"]),
  attachments: z.array(aiWorkspaceAttachmentSchema).optional(),
  widgets: z.array(generativeWidgetPayloadSchema).optional(),
  toolCalls: z.array(aiWorkspaceToolCallSchema).optional(),
  citations: z.array(aiWorkspaceCitationSchema).optional(),
  artifactIds: z.array(idSchema).optional(),
  runId: idSchema.optional(),
  runRequestId: z.string().uuid().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
}).strict();
export type AIWorkspaceMessage = z.infer<typeof aiWorkspaceMessageSchema>;

export const aiWorkspaceConversationSchema = z.object({
  id: idSchema,
  task: z.enum(["general", "code", "app-edit", "lead-outreach", "research"]).optional(),
  title: z.string().min(1).max(200),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  messages: z.array(aiWorkspaceMessageSchema).max(300),
}).strict();
export type AIWorkspaceConversation = z.infer<typeof aiWorkspaceConversationSchema>;

export const aiWorkspaceArtifactTypeSchema = z.enum(["document", "code", "react-ui", "structured-ui"]);
export const aiWorkspaceArtifactStatusSchema = z.enum(["draft", "ready", "archived"]);
export const aiWorkspaceSourceReferenceSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(500),
  url: z.string().url({protocol:/^https?$/}).optional(),
  kind: z.enum(["web", "document", "repository"]),
  documentId: z.string().optional(),
  chunkId: z.string().optional(),
  contentHash: z.string().optional(),
  retrievedAt: timestampSchema.optional(),
}).strict();
export const aiWorkspaceArtifactFileSchema = z.object({
  path: z.string().min(1).max(500).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+$/),
  language: z.string().min(1).max(40),
  content: z.string().max(1024 * 1024),
}).strict();
export const aiWorkspaceProvenanceSchema = z.object({
  provider: z.string().max(100),
  model: z.string().max(200),
  runId: idSchema,
  createdAt: timestampSchema,
  promptHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const aiWorkspaceArtifactVersionSchema = z.object({
  artifactId: idSchema,
  version: z.number().int().positive(),
  files: z.array(aiWorkspaceArtifactFileSchema).max(50),
  spec: generativeWidgetPayloadSchema.optional(),
  sourceReferences: z.array(aiWorkspaceSourceReferenceSchema).max(100),
  provenance: aiWorkspaceProvenanceSchema,
  createdAt: timestampSchema,
}).strict();
export type AIWorkspaceArtifactVersion = z.infer<typeof aiWorkspaceArtifactVersionSchema>;
export const aiWorkspaceArtifactSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  conversationId: idSchema,
  title: z.string().min(1).max(300),
  type: aiWorkspaceArtifactTypeSchema,
  status: aiWorkspaceArtifactStatusSchema,
  currentVersion: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  version: aiWorkspaceArtifactVersionSchema.optional(),
}).strict();
export type AIWorkspaceArtifact = z.infer<typeof aiWorkspaceArtifactSchema>;

export const createArtifactInputSchema = z.object({
  conversationId: idSchema,
  title: z.string().trim().min(1).max(300),
  type: aiWorkspaceArtifactTypeSchema,
  files: z.array(aiWorkspaceArtifactFileSchema).max(50).optional(),
  spec: generativeWidgetPayloadSchema.optional(),
  sourceReferences: z.array(aiWorkspaceSourceReferenceSchema).max(100).default([]),
  provenance: aiWorkspaceProvenanceSchema,
}).strict().superRefine((value, context) => {
  const hasSpec = Boolean(value.spec); const hasFiles = Boolean(value.files?.length);
  if (hasSpec === hasFiles) context.addIssue({code:"custom", message:"Provide exactly one of spec or files."});
  if (value.type === "structured-ui" && !hasSpec) context.addIssue({code:"custom", path:["spec"], message:"Structured UI artifacts require a validated component spec."});
  if (value.type !== "structured-ui" && !hasFiles) context.addIssue({code:"custom", path:["files"], message:"Document and code artifacts require files."});
});
export const updateArtifactInputSchema = z.object({
  baseVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(300).optional(),
  files: z.array(aiWorkspaceArtifactFileSchema).max(50).optional(),
  spec: generativeWidgetPayloadSchema.optional(),
  sourceReferences: z.array(aiWorkspaceSourceReferenceSchema).max(100).optional(),
  provenance: aiWorkspaceProvenanceSchema,
}).strict().refine(value => !(value.spec && value.files?.length), "Use either spec or files.").refine(value => Boolean(value.spec) || Boolean(value.files?.length) || Boolean(value.title) || Boolean(value.sourceReferences), "Provide an artifact change.");
export const restoreArtifactInputSchema = z.object({ version: z.number().int().positive() }).strict();

export const aiWorkspaceToolNameSchema = z.enum(["create_artifact", "read_artifact", "update_artifact", "render_component", "get_preview_diagnostics"]);
export const aiWorkspaceEventTypes = [
  "run.started", "text.delta", "tool.started", "tool.finished", "artifact.created", "artifact.file.delta",
  "artifact.version.completed", "preview.building", "preview.ready", "preview.error", "run.completed", "run.failed", "run.cancelled",
] as const;
export const aiWorkspaceEventSchema = z.object({
  eventId: idSchema,
  schemaVersion: z.literal(1),
  runId: idSchema,
  conversationId: idSchema,
  artifactId: idSchema.optional(),
  artifactVersion: z.number().int().positive().optional(),
  sequence: z.number().int().positive(),
  timestamp: timestampSchema,
  type: z.enum(aiWorkspaceEventTypes),
  payload: z.record(z.string(), z.unknown()),
}).strict();
export type AIWorkspaceEvent = z.infer<typeof aiWorkspaceEventSchema>;

export const startRunInputSchema = z.object({
  requestId: z.string().uuid(),
  conversationId: idSchema,
  userMessageId: idSchema,
  assistantMessageId: idSchema,
  prompt: z.string().trim().min(1).max(12000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(24000) }).strict()).max(30),
  documentIds: z.array(z.string().regex(/^document-[a-zA-Z0-9-]+$/)).max(20),
  settings: z.unknown(),
  task: z.enum(["general", "code", "app-edit", "lead-outreach", "research"]),
}).strict();
export type StartRunInput = z.infer<typeof startRunInputSchema>;
