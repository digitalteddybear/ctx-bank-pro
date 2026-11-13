"use client";

import { create } from "zustand";
import { z } from "zod";
import {
  aiWorkspaceConversationSchema, aiWorkspaceMessageSchema,
  type AIWorkspaceConversation, type AIWorkspaceMessage,
} from "@/lib/ai-workspace-contract";

export const AI_CHATS_STORAGE_KEY = "ctxbankpro:ai-chats";
export const aiChatMessageSchema = aiWorkspaceMessageSchema;
export const aiChatConversationSchema = aiWorkspaceConversationSchema;
export const aiChatStoreSchema = z.array(aiWorkspaceConversationSchema).max(100);
export type AIChatMessage = AIWorkspaceMessage;
export type AIChatConversation = AIWorkspaceConversation;
export type AIChatAttachment = z.infer<typeof import("@/lib/ai-workspace-contract").aiWorkspaceAttachmentSchema>;

type AIChatState = {
  conversations: AIChatConversation[];
  hydrated: boolean;
  hydrate: () => void;
  refresh: () => Promise<void>;
  createConversation: (text: string, attachments?: AIChatAttachment[], task?: AIChatConversation["task"]) => Promise<string>;
  addMessage: (conversationId: string, message: AIChatMessage) => Promise<void>;
  updateMessage: (conversationId: string, messageId: string, update: Partial<AIChatMessage>) => Promise<void>;
  setLocalMessage: (conversationId: string, messageId: string, update: Partial<AIChatMessage>) => void;
  removeConversation: (conversationId: string) => Promise<void>;
};

function readCache(): AIChatConversation[] {
  try { const raw = localStorage.getItem(AI_CHATS_STORAGE_KEY); return raw ? aiChatStoreSchema.parse(JSON.parse(raw)) : []; }
  catch { localStorage.removeItem(AI_CHATS_STORAGE_KEY); return []; }
}
function saveCache(conversations: AIChatConversation[]) {
  try { localStorage.setItem(AI_CHATS_STORAGE_KEY, JSON.stringify(conversations)); } catch { /* Server storage remains canonical if browser cache is unavailable. */ }
}
async function responseJson(response: Response): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = z.object({ error: z.string() }).safeParse(payload);
    throw new Error(message.success ? message.data.error : "Local workspace request failed.");
  }
  return payload;
}
async function fetchCanonicalConversations(): Promise<AIChatConversation[]> {
  const cached = readCache();
  if (cached.length) {
    const migration = await fetch("/api/ai-workspace/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversations: cached }) });
    await responseJson(migration);
  }
  const response = await fetch("/api/ai-workspace/conversations", { cache: "no-store" });
  const parsed = z.object({ conversations: aiChatStoreSchema }).safeParse(await responseJson(response));
  if (!parsed.success) throw new Error("The local workspace returned invalid chat history.");
  saveCache(parsed.data.conversations);
  return parsed.data.conversations;
}
function localUpdate(conversations: AIChatConversation[], conversationId: string, update: (conversation: AIChatConversation) => AIChatConversation) {
  return conversations.map(conversation => conversation.id === conversationId ? update(conversation) : conversation);
}

let hydrateInFlight: Promise<void> | null = null;
export const useAIChatStore = create<AIChatState>((set, get) => ({
  conversations: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated || hydrateInFlight) return;
    hydrateInFlight = fetchCanonicalConversations()
      .then(conversations => set({ conversations, hydrated: true }))
      .catch(() => set({ conversations: readCache(), hydrated: true }))
      .finally(() => { hydrateInFlight = null; });
  },
  refresh: async () => {
    if (!get().hydrated) return;
    const before = get().conversations;
    try {
      const response = await fetch("/api/ai-workspace/conversations", { cache: "no-store" });
      const parsed = z.object({ conversations: aiChatStoreSchema }).parse(await responseJson(response));
      // A local submission or stream delta takes precedence over an older poll.
      if (get().conversations !== before) return;
      const conversations = parsed.conversations.map(chat => {
        const local = before.find(item => item.id === chat.id);
        return local?.messages.at(-1)?.status === "streaming" ? local : chat;
      });
      saveCache(conversations);
      set({ conversations });
    } catch { /* Keep the last successful view during a transient polling failure. */ }
  },
  createConversation: async (text, attachments = [], task = "general") => {
    const id = crypto.randomUUID(); const createdAt = new Date().toISOString();
    const conversation: AIChatConversation = {
      id, title: text.trim().replace(/\s+/g, " ").slice(0, 64) || "New chat", task, createdAt, updatedAt: createdAt,
      messages: [{ id: crypto.randomUUID(), role: "user", content: text, createdAt, status: "complete", ...(attachments.length ? { attachments } : {}) }],
    };
    set(state => { const conversations = [conversation, ...state.conversations].slice(0, 100); saveCache(conversations); return { conversations }; });
    try {
      const response = await fetch("/api/ai-workspace/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(conversation) });
      await responseJson(response);
      return id;
    } catch (error) {
      set(state => { const conversations = state.conversations.filter(item => item.id !== id); saveCache(conversations); return { conversations }; });
      throw error;
    }
  },
  addMessage: async (conversationId, raw) => {
    const message = aiWorkspaceMessageSchema.parse(raw);
    set(state => { const conversations = localUpdate(state.conversations, conversationId, conversation => ({ ...conversation, updatedAt: message.createdAt, messages: [...conversation.messages, message].slice(-300) })); saveCache(conversations); return { conversations }; });
    const response = await fetch(`/api/ai-workspace/conversations/${encodeURIComponent(conversationId)}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(message) });
    await responseJson(response);
  },
  updateMessage: async (conversationId, messageId, update) => {
    get().setLocalMessage(conversationId, messageId, update);
    const response = await fetch(`/api/ai-workspace/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(update) });
    await responseJson(response);
  },
  setLocalMessage: (conversationId, messageId, update) => set(state => {
    const conversations = localUpdate(state.conversations, conversationId, conversation => ({ ...conversation, updatedAt: new Date().toISOString(), messages: conversation.messages.map(message => message.id === messageId ? aiWorkspaceMessageSchema.parse({ ...message, ...update }) : message) }));
    saveCache(conversations); return { conversations };
  }),
  removeConversation: async conversationId => {
    const response = await fetch(`/api/ai-workspace/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
    await responseJson(response);
    set(state => { const conversations = state.conversations.filter(conversation => conversation.id !== conversationId); saveCache(conversations); return { conversations }; });
  },
}));
