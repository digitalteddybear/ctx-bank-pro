import { randomUUID } from "node:crypto";
import { OutreachStore } from "../outreach/store";
import type { Run } from "../outreach/types";
import {
  type ProposedAction,
  type AuthorizationResult,
  type AuthorizationDecision,
  proposedActionSchema,
} from "./action-contract";

const HARD_STOP_PATTERNS = /\b(unsubscribe|stop(?: emailing| contacting| messaging)?|remove me|do not contact|don't contact)\b/i;
const LEGAL_THREAT_PATTERNS = /\b(legal action|sue you|take you to court|see you in court|report you to the ico|gdpr breach|retain counsel|solicitor|lawyer|litigation)\b/i;

export interface AuthorizerContext {
  store: OutreachStore;
  run: Run;
}

export class ActionAuthorizationEngine {
  constructor(private readonly store: OutreachStore) {}

  /**
   * Evaluates a proposed action against platform governance invariants.
   * Disconnects agent intent from platform execution permission.
   */
  authorize<T = Record<string, unknown>>(
    action: ProposedAction<T>,
    run: Run
  ): AuthorizationResult {
    // 1. Validate structured input
    const parsed = proposedActionSchema.safeParse(action);
    if (!parsed.success) {
      return this.recordDecision(
        action.id,
        "QUARANTINED_ANOMALOUS",
        false,
        `Malformed proposed action schema: ${parsed.error.message}`,
        "compliance_officer"
      );
    }

    const recipientEmail = action.recipientEmail.toLowerCase().trim();

    // 2. Invariant: Permanent Suppression Gate
    if (this.store.isSuppressed(recipientEmail)) {
      return this.recordDecision(
        action.id,
        "DENIED_SUPPRESSED",
        false,
        `Target recipient '${recipientEmail}' is in the permanent suppression registry.`
      );
    }

    // 3. Invariant: Global & Campaign Pause Gates
    if (this.store.setting("paused") === "true") {
      return this.recordDecision(
        action.id,
        "DENIED_PACING_THROTTLED",
        false,
        "Platform is in global paused state."
      );
    }
    if (run.campaignId && this.store.setting(`campaign-paused:${run.campaignId}`) === "true") {
      return this.recordDecision(
        action.id,
        "DENIED_PACING_THROTTLED",
        false,
        `Campaign '${run.campaignId}' is currently paused by operator.`
      );
    }

    // 4. Invariant: Contact Permission Check (Non-sandbox runs)
    if (!run.sandbox && run.prospect.permission !== "granted") {
      return this.recordDecision(
        action.id,
        "DENIED_OPT_OUT",
        false,
        "Contact permission is not granted for production operations."
      );
    }

    // 5. Invariant: Opt-Out & Legal Threat Detection in Transcript
    const hasOptOutInbound = run.transcript.some(
      (turn) => turn.direction === "inbound" && (HARD_STOP_PATTERNS.test(turn.text) || LEGAL_THREAT_PATTERNS.test(turn.text))
    );
    if (hasOptOutInbound) {
      return this.recordDecision(
        action.id,
        "DENIED_OPT_OUT",
        false,
        "Inbound opt-out or legal dispute detected in conversation trajectory."
      );
    }

    // 6. Invariant: Hash-Locked Human Approval Verification
    // External delivery actions in human mode REQUIRE matching approval hash
    if (action.actionType.startsWith("outreach.send_")) {
      if (run.mode === "human") {
        if (!run.approval) {
          return this.recordDecision(
            action.id,
            "DENIED_MISSING_APPROVAL",
            false,
            "External outreach action requires human operator approval in human mode."
          );
        }

        // Verify that the draft hash matches the approval hash exactly
        if (run.approval.draftHash !== action.payloadHash) {
          return this.recordDecision(
            action.id,
            "DENIED_APPROVAL_HASH_MISMATCH",
            false,
            `Payload hash (${action.payloadHash}) does not match approved hash (${run.approval.draftHash}). Post-approval edit detected.`
          );
        }
      }

      // In either mode, independent compliance review must have passed
      if (run.review?.decision !== "pass") {
        return this.recordDecision(
          action.id,
          "DENIED_UNVERIFIED_EVIDENCE",
          false,
          `Compliance review did not pass. Status: ${run.review?.decision ?? "unreviewed"}.`
        );
      }
    }

    // 7. Invariant: Idempotency & Replay Protection
    // Receipts prevent duplicate execution of the exact same action proposal
    const idempotencyKey = `auth_action:${action.id}`;
    const acquiredReceipt = this.store.receipt(idempotencyKey, {
      payloadHash: action.payloadHash,
      runId: action.runId,
      actionType: action.actionType,
    });
    if (!acquiredReceipt) {
      return this.recordDecision(
        action.id,
        "DENIED_IDEMPOTENT_DUPLICATE",
        false,
        `Action '${action.id}' has already been authorized or executed.`
      );
    }

    // 8. All Platform Invariants Satisfied -> AUTHORIZED
    return this.recordDecision(action.id, "AUTHORIZED", true);
  }

  private recordDecision(
    actionId: string,
    decision: AuthorizationDecision,
    authorized: boolean,
    rejectionReason?: string,
    quarantineQueue?: string
  ): AuthorizationResult {
    const auditTrailId = randomUUID();
    const result: AuthorizationResult = {
      decision,
      actionId,
      authorized,
      rejectionReason,
      quarantineQueue,
      evaluatedAt: Date.now(),
      auditTrailId,
    };

    // Log deterministic governance audit event
    this.store.event(actionId, "action_authorization_evaluated", {
      decision,
      authorized,
      rejectionReason,
      auditTrailId,
    });

    return result;
  }
}
