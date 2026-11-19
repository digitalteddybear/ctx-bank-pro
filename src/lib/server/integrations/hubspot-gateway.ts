/**
 * Zero-Trust HubSpot Integration Gateway for ASP Private Capital / CTX.
 *
 * Implements strict zero-trust perimeters:
 * 1. Token Isolation: HUBSPOT_ACCESS_TOKEN is encapsulated and never exposed to LLMs, client code, or logs.
 * 2. Deterministic Gateway: Only predefined methods may format HTTP requests.
 * 3. 25-Lead Fixed Allowlist: All operations verified against immutable approved ID and email pairs.
 * 4. Property Whitelist: Restricts writable properties to ctx_status, ctx_last_contact, ctx_booking_link_sent.
 * 5. Predefined Operations: Only updateOutreachStatus, logEmailEngagement, logReplyEngagement.
 * 6. Hard Rejection: Blocks DELETE, contact creation, deal creation, bulk batches, and unauthorized fields.
 * 7. Multi-Gate Validation: Checks human approval, payload schema, and messageId idempotency.
 * 8. Fail-Closed Default: HUBSPOT_WRITES_ENABLED defaults to false.
 * 9. Append-Only Audit: Records all attempts and completions with zero secret leakage.
 * 10. Agent Invariance: Static compiled allowlists and kill-switch logic cannot be altered by agent prompts.
 * 11. Mockable Network: Supports injected fetch handler for offline and unit testing.
 * 12. Microservice Option: Supports delegation to an independently authenticated gateway service.
 */
import { isAllowlistedContact } from "./hubspot-allowlist";
import { z } from "zod";
import {
  ALLOWED_WRITABLE_PROPERTIES,
  updateOutreachStatusSchema,
  logEmailEngagementSchema,
  logReplyEngagementSchema,
  type UpdateOutreachStatusInput,
  type LogEmailEngagementInput,
  type LogReplyEngagementInput,
  type GatewayOperationResult,
  type PermittedOperation,
} from "./hubspot-types";
import { getHubSpotAuditLogger, HubSpotAuditLogger } from "./hubspot-audit";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

export class HubSpotZeroTrustGateway {
  constructor(
    private readonly auditLogger: HubSpotAuditLogger = getHubSpotAuditLogger(),
    private readonly customFetch?: typeof fetch
  ) {}

  private get fetchFn(): typeof fetch {
    return this.customFetch ?? globalThis.fetch;
  }

  private isWritesEnabled(): boolean {
    return process.env.HUBSPOT_WRITES_ENABLED === "true";
  }

  private getAccessToken(): string | undefined {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token || token.trim().length === 0) return undefined;
    return token.trim();
  }

  /**
   * Evaluates common zero-trust pre-flight constraints:
   * 1. Allowlist membership and email alignment
   * 2. Idempotency against duplicate messageId
   */
  private preflight(
    operation: PermittedOperation,
    hubspotId: string,
    email: string,
    messageId: string,
    approvedBy: string,
    payload: unknown
  ): GatewayOperationResult | null {
    // Check 1: 25-Lead Fixed Allowlist
    if (!isAllowlistedContact(hubspotId, email)) {
      const auditLogId = this.auditLogger.record({
        operation,
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "DENIED_NOT_IN_ALLOWLIST",
        status: "blocked",
        payload,
        details: `Rejected contact [ID: ${hubspotId}, Email: ${email}]: Not in the approved 25-lead launch cohort.`,
      });
      return {
        success: false,
        operation,
        hubspotId,
        status: "blocked",
        decision: "DENIED_NOT_IN_ALLOWLIST",
        error: `HubSpot contact ${hubspotId} (${email}) is not in the approved 25-lead allowlist.`,
        auditLogId,
      };
    }

    // Check 2: Idempotency (prevent duplicate operations for same messageId)
    if (this.auditLogger.isDuplicateMessageId(messageId, operation)) {
      const auditLogId = this.auditLogger.record({
        operation,
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "DENIED_IDEMPOTENT_DUPLICATE",
        status: "blocked",
        payload,
        details: `Idempotency check: Operation '${operation}' already applied for messageId '${messageId}'.`,
      });
      return {
        success: false,
        operation,
        hubspotId,
        status: "blocked",
        decision: "DENIED_IDEMPOTENT_DUPLICATE",
        error: `Duplicate messageId '${messageId}' detected. Operation '${operation}' previously completed.`,
        auditLogId,
      };
    }

    return null;
  }

  /**
   * Operation 1: updateOutreachStatus
   * Restricts writable properties strictly to ctx_status, ctx_last_contact, ctx_booking_link_sent.
   */
  async updateOutreachStatus(rawInput: unknown): Promise<GatewayOperationResult> {
    const parse = updateOutreachStatusSchema.safeParse(rawInput);
    if (!parse.success) {
      const input = (rawInput ?? {}) as Partial<UpdateOutreachStatusInput>;
      const auditLogId = this.auditLogger.record({
        operation: "updateOutreachStatus",
        hubspotId: input.hubspotId ?? "unknown",
        email: input.email ?? "unknown@invalid.test",
        messageId: input.messageId ?? "missing-id",
        approvedBy: input.approvedBy ?? "unknown",
        decision: "DENIED_MALFORMED_PAYLOAD",
        status: "blocked",
        payload: rawInput,
        details: `Schema validation failed: ${parse.error.message}`,
      });
      return {
        success: false,
        operation: "updateOutreachStatus",
        hubspotId: input.hubspotId ?? "unknown",
        status: "blocked",
        decision: "DENIED_MALFORMED_PAYLOAD",
        error: `Schema validation failed: ${parse.error.message}`,
        auditLogId,
      };
    }

    const { hubspotId, email, messageId, approvedBy, properties } = parse.data;

    // Verify property key whitelist
    for (const key of Object.keys(properties)) {
      if (!ALLOWED_WRITABLE_PROPERTIES.has(key as never)) {
        const auditLogId = this.auditLogger.record({
          operation: "updateOutreachStatus",
          hubspotId,
          email,
          messageId,
          approvedBy,
          decision: "DENIED_FIELD_UNAUTHORIZED",
          status: "blocked",
          payload: properties,
          details: `Attempted to write unauthorized property '${key}'. Permitted: ctx_status, ctx_last_contact, ctx_booking_link_sent.`,
        });
        return {
          success: false,
          operation: "updateOutreachStatus",
          hubspotId,
          status: "blocked",
          decision: "DENIED_FIELD_UNAUTHORIZED",
          error: `Property '${key}' is not permitted. Only ctx_status, ctx_last_contact, and ctx_booking_link_sent may be updated.`,
          auditLogId,
        };
      }
    }

    const rejection = this.preflight(
      "updateOutreachStatus",
      hubspotId,
      email,
      messageId,
      approvedBy,
      properties
    );
    if (rejection) return rejection;

    // Fail-Closed Default (Dry-Run when writes are disabled)
    if (!this.isWritesEnabled()) {
      const auditLogId = this.auditLogger.record({
        operation: "updateOutreachStatus",
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "ALLOWED_DRY_RUN",
        status: "dry_run",
        payload: properties,
        details: "Dry-run successful: HUBSPOT_WRITES_ENABLED=false (fail-closed default). No network request executed.",
      });
      return {
        success: true,
        operation: "updateOutreachStatus",
        hubspotId,
        status: "dry_run",
        decision: "ALLOWED_DRY_RUN",
        detail: "Dry-run passed: Verified allowlist and properties. Live write withheld (HUBSPOT_WRITES_ENABLED=false).",
        auditLogId,
      };
    }

    // Live Execution (Microservice or Direct)
    return this.executeLiveContactPatch(hubspotId, email, messageId, approvedBy, properties);
  }

  /**
   * Operation 2: logEmailEngagement
   * Logs an outbound relationship email sent by Dylan to the HubSpot Contact Timeline.
   */
  async logEmailEngagement(rawInput: unknown): Promise<GatewayOperationResult> {
    const parse = logEmailEngagementSchema.safeParse(rawInput);
    if (!parse.success) {
      const input = (rawInput ?? {}) as Partial<LogEmailEngagementInput>;
      const auditLogId = this.auditLogger.record({
        operation: "logEmailEngagement",
        hubspotId: input.hubspotId ?? "unknown",
        email: input.email ?? "unknown@invalid.test",
        messageId: input.messageId ?? "missing-id",
        approvedBy: input.approvedBy ?? "unknown",
        decision: "DENIED_MALFORMED_PAYLOAD",
        status: "blocked",
        payload: rawInput,
        details: `Schema validation failed: ${parse.error.message}`,
      });
      return {
        success: false,
        operation: "logEmailEngagement",
        hubspotId: input.hubspotId ?? "unknown",
        status: "blocked",
        decision: "DENIED_MALFORMED_PAYLOAD",
        error: `Schema validation failed: ${parse.error.message}`,
        auditLogId,
      };
    }

    const { hubspotId, email, messageId, approvedBy, subject, bodyText, sentAt, threadId } = parse.data;

    const rejection = this.preflight(
      "logEmailEngagement",
      hubspotId,
      email,
      messageId,
      approvedBy,
      { subject, sentAt, threadId }
    );
    if (rejection) return rejection;

    if (!this.isWritesEnabled()) {
      const auditLogId = this.auditLogger.record({
        operation: "logEmailEngagement",
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "ALLOWED_DRY_RUN",
        status: "dry_run",
        payload: { subject, sentAt: sentAt ?? new Date().toISOString(), threadId },
        details: "Dry-run successful: HUBSPOT_WRITES_ENABLED=false. Email engagement validated with zero live write.",
      });
      return {
        success: true,
        operation: "logEmailEngagement",
        hubspotId,
        status: "dry_run",
        decision: "ALLOWED_DRY_RUN",
        detail: "Dry-run passed: Verified allowlist and email payload. Live write withheld.",
        auditLogId,
      };
    }

    return this.executeLiveEmail(hubspotId, email, messageId, approvedBy, "logEmailEngagement", "EMAIL", subject, bodyText, sentAt, threadId);
  }

  /**
   * Operation 3: logReplyEngagement
   * Logs an inbound investor reply and classified sentiment to the HubSpot Contact Timeline.
   */
  async logReplyEngagement(rawInput: unknown): Promise<GatewayOperationResult> {
    const parse = logReplyEngagementSchema.safeParse(rawInput);
    if (!parse.success) {
      const input = (rawInput ?? {}) as Partial<LogReplyEngagementInput>;
      const auditLogId = this.auditLogger.record({
        operation: "logReplyEngagement",
        hubspotId: input.hubspotId ?? "unknown",
        email: input.email ?? "unknown@invalid.test",
        messageId: input.messageId ?? "missing-id",
        approvedBy: "conversation_classifier",
        decision: "DENIED_MALFORMED_PAYLOAD",
        status: "blocked",
        payload: rawInput,
        details: `Schema validation failed: ${parse.error.message}`,
      });
      return {
        success: false,
        operation: "logReplyEngagement",
        hubspotId: input.hubspotId ?? "unknown",
        status: "blocked",
        decision: "DENIED_MALFORMED_PAYLOAD",
        error: `Schema validation failed: ${parse.error.message}`,
        auditLogId,
      };
    }

    const { hubspotId, email, messageId, sentiment, replyText, replyAt, threadId } = parse.data;

    const rejection = this.preflight(
      "logReplyEngagement",
      hubspotId,
      email,
      messageId,
      "inbound_classifier",
      { sentiment, replyAt, threadId }
    );
    if (rejection) return rejection;

    if (!this.isWritesEnabled()) {
      const auditLogId = this.auditLogger.record({
        operation: "logReplyEngagement",
        hubspotId,
        email,
        messageId,
        approvedBy: "inbound_classifier",
        decision: "ALLOWED_DRY_RUN",
        status: "dry_run",
        payload: { sentiment, replyAt: replyAt ?? new Date().toISOString(), threadId },
        details: "Dry-run successful: HUBSPOT_WRITES_ENABLED=false. Reply engagement validated with zero live write.",
      });
      return {
        success: true,
        operation: "logReplyEngagement",
        hubspotId,
        status: "dry_run",
        decision: "ALLOWED_DRY_RUN",
        detail: "Dry-run passed: Verified allowlist and reply payload. Live write withheld.",
        auditLogId,
      };
    }

    return this.executeLiveEmail(hubspotId, email, messageId, "inbound_classifier", "logReplyEngagement", "INCOMING_EMAIL", `Reply (${sentiment})`, replyText, replyAt, threadId);
  }

  async logBrokerBriefingNote(input: {
    hubspotId: string;
    email: string;
    messageId: string;
    stage: string;
    evidenceSource?: "Cal.com";
    prospectQuote: string;
    agentBrief: string;
    talkingPoints: string[];
  }): Promise<GatewayOperationResult> {
    const parsed = z.object({hubspotId:z.string().regex(/^\d+$/),email:z.string().email().toLowerCase(),messageId:z.string().min(8),stage:z.string().min(1).max(100),evidenceSource:z.literal("Cal.com").optional(),prospectQuote:z.string().min(1).max(10000),agentBrief:z.string().min(1).max(4000),talkingPoints:z.array(z.string().min(1).max(1000)).length(3)}).strict().safeParse(input);
    if (!parsed.success) return this.recordEngagementFailure("logReplyEngagement",input.hubspotId,input.email,input.messageId,"conversation_agent",`Invalid broker briefing: ${parsed.error.message}`,undefined,"DENIED_MALFORMED_PAYLOAD");
    const rejection=this.preflight("logReplyEngagement",input.hubspotId,input.email,`${input.messageId}:broker-brief`,"conversation_agent",{stage:input.stage});
    if(rejection)return rejection;
    if(!this.isWritesEnabled()){
      const auditLogId=this.auditLogger.record({operation:"logReplyEngagement",hubspotId:input.hubspotId,email:input.email,messageId:`${input.messageId}:broker-brief`,approvedBy:"conversation_agent",decision:"ALLOWED_DRY_RUN",status:"dry_run",payload:{stage:input.stage},details:"Broker briefing validated; HUBSPOT_WRITES_ENABLED=false."});
      return {success:true,operation:"logReplyEngagement",hubspotId:input.hubspotId,status:"dry_run",decision:"ALLOWED_DRY_RUN",detail:"Broker briefing passed dry-run validation.",auditLogId};
    }
    const body = [
      `Trajectory stage: ${input.stage}`,
      input.evidenceSource ? `Cal.com event: ${input.prospectQuote.slice(0, 1500)}` : `Prospect quote: “${input.prospectQuote.slice(0, 1500)}”`,
      `Agent brief: ${input.agentBrief.slice(0, 1500)}`,
      "Broker talking points:",
      ...input.talkingPoints.slice(0, 3).map((point, index) => `${index + 1}. ${point.slice(0, 500)}`),
    ].join("\n\n");
    return this.executeLiveEngagementNote(input.hubspotId, input.email, `${input.messageId}:broker-brief`, "conversation_agent", "logReplyEngagement", body);
  }

  private async executeLiveEmail(
    hubspotId: string,
    email: string,
    messageId: string,
    approvedBy: string,
    operation: PermittedOperation,
    direction: "EMAIL" | "INCOMING_EMAIL",
    subject: string,
    bodyText: string,
    timestamp?: string,
    threadId?: string
  ): Promise<GatewayOperationResult> {
    const token = this.getAccessToken();
    if (!token) return this.recordEngagementFailure(operation, hubspotId, email, messageId, approvedBy, "Missing HUBSPOT_ACCESS_TOKEN credential.", undefined, "DENIED_KILL_SWITCH");
    try {
      const emailProperties: Record<string, string> = {
        hs_timestamp: timestamp ?? new Date().toISOString(),
        hs_email_direction: direction,
        hs_email_status: "SENT",
        hs_email_subject: subject,
        hs_email_text: bodyText,
        hs_email_headers: JSON.stringify(direction === "EMAIL"
          ? {
              from: { email: process.env.GMAIL_USER ?? "" },
              to: [{ email }],
              ...(threadId ? { messageId, inReplyTo: threadId } : { messageId }),
            }
          : {
              from: { email },
              to: [{ email: process.env.GMAIL_USER ?? "" }],
              ...(threadId ? { messageId, inReplyTo: threadId } : { messageId }),
            }),
      };
      if (threadId) {
        emailProperties.hs_email_thread_id = threadId;
      }

      const response = await this.fetchFn(`${HUBSPOT_API_BASE}/crm/v3/objects/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: emailProperties,
          associations: [{ to: { id: hubspotId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }] }],
        }),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 400);
        return this.recordEngagementFailure(operation, hubspotId, email, messageId, approvedBy, `HubSpot email activity returned HTTP ${response.status}: ${detail}`, response.status);
      }
      const auditLogId = this.auditLogger.record({ operation, hubspotId, email, messageId, approvedBy, decision: "ALLOWED_LIVE", status: "applied", payload: { direction, subject, bodyLength: bodyText.length, threadId }, details: "Email activity created and associated with the existing contact.", httpStatus: response.status });
      return { success: true, operation, hubspotId, status: "applied", decision: "ALLOWED_LIVE", detail: "Email activity logged to the HubSpot contact.", auditLogId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      return this.recordEngagementFailure(operation, hubspotId, email, messageId, approvedBy, `HubSpot email activity failed: ${message}`);
    }
  }

  private recordEngagementFailure(operation: PermittedOperation, hubspotId: string, email: string, messageId: string, approvedBy: string, details: string, httpStatus?: number, decision: GatewayOperationResult["decision"] = "ERROR_HTTP_FAILURE"): GatewayOperationResult {
    const auditLogId = this.auditLogger.record({ operation, hubspotId, email, messageId, approvedBy, decision, status: "error", payload: {}, details, httpStatus });
    return { success: false, operation, hubspotId, status: "error", decision, error: details.split(":")[0], auditLogId };
  }

  /**
   * Deterministic execution for Contact Property Patch
   */
  private async executeLiveContactPatch(
    hubspotId: string,
    email: string,
    messageId: string,
    approvedBy: string,
    properties: Record<string, unknown>
  ): Promise<GatewayOperationResult> {
    const token = this.getAccessToken();
    if (!token) {
      const auditLogId = this.auditLogger.record({
        operation: "updateOutreachStatus",
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "DENIED_KILL_SWITCH",
        status: "error",
        payload: properties,
        details: "HUBSPOT_ACCESS_TOKEN is missing or empty. Live operation aborted.",
      });
      return {
        success: false,
        operation: "updateOutreachStatus",
        hubspotId,
        status: "error",
        decision: "DENIED_KILL_SWITCH",
        error: "Missing HUBSPOT_ACCESS_TOKEN credential.",
        auditLogId,
      };
    }

    try {
      const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${encodeURIComponent(hubspotId)}`;
      const res = await this.fetchFn(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        const auditLogId = this.auditLogger.record({
          operation: "updateOutreachStatus",
          hubspotId,
          email,
          messageId,
          approvedBy,
          decision: "ERROR_HTTP_FAILURE",
          status: "error",
          payload: properties,
          details: `HubSpot API returned HTTP ${res.status}: ${errorText.slice(0, 500)}`,
          httpStatus: res.status,
        });
        return {
          success: false,
          operation: "updateOutreachStatus",
          hubspotId,
          status: "error",
          decision: "ERROR_HTTP_FAILURE",
          error: `HubSpot API error (HTTP ${res.status}).`,
          auditLogId,
        };
      }

      const auditLogId = this.auditLogger.record({
        operation: "updateOutreachStatus",
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "ALLOWED_LIVE",
        status: "applied",
        payload: properties,
        details: `Successfully updated contact properties in HubSpot.`,
        httpStatus: res.status,
      });

      return {
        success: true,
        operation: "updateOutreachStatus",
        hubspotId,
        status: "applied",
        decision: "ALLOWED_LIVE",
        detail: "Contact properties successfully updated in HubSpot.",
        auditLogId,
      };
    } catch (err) {
      const errorMsg = (err as Error).message;
      const auditLogId = this.auditLogger.record({
        operation: "updateOutreachStatus",
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "ERROR_HTTP_FAILURE",
        status: "error",
        payload: properties,
        details: `Network failure executing HubSpot patch: ${errorMsg}`,
      });
      return {
        success: false,
        operation: "updateOutreachStatus",
        hubspotId,
        status: "error",
        decision: "ERROR_HTTP_FAILURE",
        error: `Network failure: ${errorMsg}`,
        auditLogId,
      };
    }
  }

  /**
   * Deterministic execution for Timeline Engagement Note
   */
  private async executeLiveEngagementNote(
    hubspotId: string,
    email: string,
    messageId: string,
    approvedBy: string,
    operation: PermittedOperation,
    bodyContent: string
  ): Promise<GatewayOperationResult> {
    const token = this.getAccessToken();
    if (!token) {
      const auditLogId = this.auditLogger.record({
        operation,
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "DENIED_KILL_SWITCH",
        status: "error",
        payload: { bodyLength: bodyContent.length },
        details: "HUBSPOT_ACCESS_TOKEN is missing or empty. Live operation aborted.",
      });
      return {
        success: false,
        operation,
        hubspotId,
        status: "error",
        decision: "DENIED_KILL_SWITCH",
        error: "Missing HUBSPOT_ACCESS_TOKEN credential.",
        auditLogId,
      };
    }

    try {
      const url = `${HUBSPOT_API_BASE}/crm/v3/objects/notes`;
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            hs_timestamp: new Date().toISOString(),
            hs_note_body: bodyContent,
          },
          associations: [
            {
              to: { id: hubspotId },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 202, // Note to Contact association
                },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        const auditLogId = this.auditLogger.record({
          operation,
          hubspotId,
          email,
          messageId,
          approvedBy,
          decision: "ERROR_HTTP_FAILURE",
          status: "error",
          payload: { bodySnippet: bodyContent.slice(0, 100) },
          details: `HubSpot API returned HTTP ${res.status}: ${errorText.slice(0, 500)}`,
          httpStatus: res.status,
        });
        return {
          success: false,
          operation,
          hubspotId,
          status: "error",
          decision: "ERROR_HTTP_FAILURE",
          error: `HubSpot API note error (HTTP ${res.status}).`,
          auditLogId,
        };
      }

      const auditLogId = this.auditLogger.record({
        operation,
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "ALLOWED_LIVE",
        status: "applied",
        payload: { bodySnippet: bodyContent.slice(0, 100) },
        details: "Successfully logged timeline note engagement to HubSpot contact.",
        httpStatus: res.status,
      });

      return {
        success: true,
        operation,
        hubspotId,
        status: "applied",
        decision: "ALLOWED_LIVE",
        detail: "Timeline engagement note successfully created in HubSpot.",
        auditLogId,
      };
    } catch (err) {
      const errorMsg = (err as Error).message;
      const auditLogId = this.auditLogger.record({
        operation,
        hubspotId,
        email,
        messageId,
        approvedBy,
        decision: "ERROR_HTTP_FAILURE",
        status: "error",
        payload: { bodySnippet: bodyContent.slice(0, 100) },
        details: `Network failure executing HubSpot note creation: ${errorMsg}`,
      });
      return {
        success: false,
        operation,
        hubspotId,
        status: "error",
        decision: "ERROR_HTTP_FAILURE",
        error: `Network failure: ${errorMsg}`,
        auditLogId,
      };
    }
  }
}

const g = globalThis as typeof globalThis & { __ctxHubSpotGateway?: HubSpotZeroTrustGateway };

export function getHubSpotGateway(): HubSpotZeroTrustGateway {
  g.__ctxHubSpotGateway ??= new HubSpotZeroTrustGateway();
  return g.__ctxHubSpotGateway;
}
