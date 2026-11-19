import { z } from "zod";
import type { Citation } from "../outreach/types";

export const ACTION_TYPES = [
  "outreach.send_initial",
  "outreach.send_followup",
  "outreach.send_reply",
  "calendar.offer_slots",
  "crm.update_contact_property",
  "crm.log_activity_note",
  "crm.log_email_record",
  "workflow.escalate_to_human",
  "workflow.suppress_contact",
] as const;

export type ActionType = typeof ACTION_TYPES[number];

export const proposedActionSchema = z.object({
  id: z.string().uuid().or(z.string().min(1).max(128)),
  runId: z.string().min(1).max(128),
  agentId: z.string().min(1).max(64),
  actionType: z.enum(ACTION_TYPES),
  targetEntityId: z.string().min(1).max(128),
  targetChannel: z.enum(["email", "crm", "calendar", "internal"]),
  recipientEmail: z.string().email(),
  payload: z.record(z.string(), z.unknown()),
  payloadHash: z.string().length(64),
  evidenceCitations: z.array(
    z.object({
      sourceId: z.string(),
      hash: z.string(),
      quote: z.string(),
    })
  ).default([]),
  proposedAt: z.number().int().positive(),
});

export type ProposedAction<T = Record<string, unknown>> = Omit<z.infer<typeof proposedActionSchema>, "payload"> & {
  payload: T;
  evidenceCitations: Citation[];
};

export const AUTHORIZATION_DECISIONS = [
  "AUTHORIZED",
  "DENIED_SUPPRESSED",
  "DENIED_OPT_OUT",
  "DENIED_MISSING_APPROVAL",
  "DENIED_APPROVAL_HASH_MISMATCH",
  "DENIED_IDEMPOTENT_DUPLICATE",
  "DENIED_UNVERIFIED_EVIDENCE",
  "DENIED_PACING_THROTTLED",
  "QUARANTINED_ANOMALOUS",
] as const;

export type AuthorizationDecision = typeof AUTHORIZATION_DECISIONS[number];

export interface AuthorizationResult {
  decision: AuthorizationDecision;
  actionId: string;
  authorized: boolean;
  rejectionReason?: string;
  quarantineQueue?: string;
  evaluatedAt: number;
  auditTrailId: string;
}
