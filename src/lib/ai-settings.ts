import { z } from "zod";

export const modelProviderSchema = z.enum(["auto", "openrouter", "openai", "openai-oauth", "anthropic", "openai-compatible", "ollama"]);
export const providerStatusSchema = z.object({openrouter:z.boolean(),openai:z.boolean(),openaiOAuth:z.boolean(),anthropic:z.boolean(),openaiCompatible:z.boolean(),ollama:z.boolean()});
export const openAIOAuthStatusSchema = z.object({connected:z.boolean(),email:z.string().email().nullable(),canUsePlan:z.boolean(),scopes:z.array(z.string()),expiresAt:z.number().nullable()});
export const openAIModelCatalogSchema = z.object({models:z.array(z.object({id:z.string(),name:z.string()}))});
export const aiSettingsSchema = z.object({
  routing: z.enum(["automatic", "manual"]),
  models: z.object({
    generalChat: z.object({ provider: modelProviderSchema, model: z.string().max(200) }),
    appEditor: z.object({ provider: modelProviderSchema, model: z.string().max(200), targetFile: z.string().max(300) }),
    leadOutreach: z.object({ provider: modelProviderSchema, model: z.string().max(200) }),
    codeAnalysis: z.object({ provider: modelProviderSchema, model: z.string().max(200) }),
  }),
  reasoning: z.object({ extended: z.boolean(), tokenBudget: z.number().int().min(1024).max(64000), showTrace: z.boolean() }),
  planning: z.enum(["direct", "tree-search"]),
  sampling: z.object({ temperature: z.number().min(0).max(2), topP: z.number().min(0).max(1), frequencyPenalty: z.number().min(-2).max(2) }),
  persona: z.enum(["App Architect", "Credit Analyst", "Direct Outbound Copywriter", "Code Auditor"]),
});

export type AISettings = z.infer<typeof aiSettingsSchema>;

export const DEFAULT_AI_SETTINGS: AISettings = {
  routing: "automatic",
  models: {
    generalChat: { provider: "auto", model: "" },
    appEditor: { provider: "auto", model: "", targetFile: "" },
    leadOutreach: { provider: "auto", model: "" },
    codeAnalysis: { provider: "auto", model: "" },
  },
  reasoning: { extended: false, tokenBudget: 8192, showTrace: false },
  planning: "direct",
  sampling: { temperature: 0.7, topP: 1, frequencyPenalty: 0 },
  persona: "App Architect",
};

export const AI_SETTINGS_STORAGE_KEY = "ctxbankpro:ai-settings";
