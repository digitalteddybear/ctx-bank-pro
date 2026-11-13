/**
 * Strict Zero-Trust Schemas & Types for HubSpot Integration Gateway.
 *
 * Enforces:
 * - Only 3 permitted operations: updateOutreachStatus, logEmailEngagement, logReplyEngagement.
 * - Only 3 writable contact fields: ctx_status, ctx_last_contact, ctx_booking_link_sent.
 * - Mandatory human approval validation & idempotency keys.
 */
import { z } from "zod";

export const PERMITTED_OPERATIONS = [
  "updateOutreachStatus",
  "logEmailEngagement",
  "logReplyEngagement",
] as const;

export type PermittedOperation = (typeof PERMITTED_OPERATIONS)[number];

export const ALLOWED_STATUS_VALUES = [
  "Queued",
  "Dispatched",
  "Replied",
  "Booked",
  "Opted Out",
] as const;

export type AllowedStatusValue = (typeof ALLOWED_STATUS_VALUES)[number];

export const ALLOWED_SENTIMENT_VALUES = [
  "Interested",
  "Question",
  "Objection",
  "Booking Request",
  "Not Interested",
  "Out of Office",
  "Advice Request",
  "Unclear",
  "Opt Out",
  "Legal Threat",
  "Complaint",
] as const;

export type AllowedSentimentValue = (typeof ALLOWED_SENTIMENT_VALUES)[number];

/** Writable contact property names allowed in HubSpot CRM */
export const ALLOWED_WRITABLE_PROPERTIES: ReadonlySet<string> = new Set([
  "ctx_status",
  "ctx_last_contact",
  "ctx_booking_link_sent",
]);

export const updateOutreachStatusSchema = z.object({
  hubspotId: z.string().regex(/^\d+$/, "HubSpot ID must be numeric string"),
  email: z.string().email().toLowerCase(),
  messageId: z.string().min(8, "Valid messageId required for idempotency"),
  approvedBy: z.string().min(2, "Human operator approval identifier required"),
  properties: z
    .object({
      ctx_status: z.enum(ALLOWED_STATUS_VALUES).optional(),
      ctx_last_contact: z.string().optional(),
      ctx_booking_link_sent: z.boolean().optional(),
    })
    .strict()
    .refine(
      (data) => Object.keys(data).length > 0,
      "At least one writable property must be provided"
    ),
});

export type UpdateOutreachStatusInput = z.infer<typeof updateOutreachStatusSchema>;

export const logEmailEngagementSchema = z.object({
  hubspotId: z.string().regex(/^\d+$/, "HubSpot ID must be numeric string"),
  email: z.string().email().toLowerCase(),
  messageId: z.string().min(8, "Valid messageId required for idempotency"),
  approvedBy: z.string().min(2, "Human operator approval identifier required"),
  subject: z.string().min(1).max(255),
  bodyText: z.string().min(1).max(10000),
  sentAt: z.string().datetime().optional(),
  threadId: z.string().min(1).max(255).optional(),
});

export type LogEmailEngagementInput = z.infer<typeof logEmailEngagementSchema>;

export const logReplyEngagementSchema = z.object({
  hubspotId: z.string().regex(/^\d+$/, "HubSpot ID must be numeric string"),
  email: z.string().email().toLowerCase(),
  messageId: z.string().min(8, "Valid messageId required for idempotency"),
  sentiment: z.enum(ALLOWED_SENTIMENT_VALUES),
  replyText: z.string().min(1).max(10000),
  replyAt: z.string().datetime().optional(),
  threadId: z.string().min(1).max(255).optional(),
});

export type LogReplyEngagementInput = z.infer<typeof logReplyEngagementSchema>;

export interface GatewayOperationResult {
  readonly success: boolean;
  readonly operation: PermittedOperation;
  readonly hubspotId: string;
  readonly status: "applied" | "dry_run" | "blocked" | "error";
  readonly decision:
    | "ALLOWED_LIVE"
    | "ALLOWED_DRY_RUN"
    | "DENIED_KILL_SWITCH"
    | "DENIED_NOT_IN_ALLOWLIST"
    | "DENIED_FIELD_UNAUTHORIZED"
    | "DENIED_OPERATION_UNAUTHORIZED"
    | "DENIED_HUMAN_APPROVAL_MISSING"
    | "DENIED_IDEMPOTENT_DUPLICATE"
    | "DENIED_MALFORMED_PAYLOAD"
    | "ERROR_HTTP_FAILURE";
  readonly detail?: string;
  readonly error?: string;
  readonly auditLogId?: string;
}
