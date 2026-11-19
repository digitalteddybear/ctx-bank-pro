import { z } from "zod";

// Drafts may be incomplete. Launch separately validates identity and delivery readiness.
export const demoPreferencesSchema = z.object({
  prospectName: z.string().max(200),
  prospectEmail: z.string().max(320),
  hubspotContactId: z.string().max(100),
  customSubject: z.string().max(200),
  customBody: z.string().max(10000),
  replyHtmlTemplate: z.string().max(20000),
  liveSend: z.boolean(),
  liveCrm: z.boolean(),
  useLiveModel: z.boolean().nullable(),
}).strict();
export const demoPreferencesResponseSchema = z.object({
  preferences: demoPreferencesSchema.nullable(),
  template: z.string(),
  templateVersion: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
});
