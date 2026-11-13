import nodemailer from "nodemailer";
import { renderReplyHtml } from "./reply-html";
import { findPhase1LeadByEmail } from "../phase1";
import { validateTestRecipientBoundary } from "../test-boundary";
import {
  HEADER_ASP_AGENT,
  HEADER_ASP_ORIGIN,
  HEADER_ASP_PHASE1_LEAD,
  HEADER_ASP_PHASE1_VALIDATED,
  HEADER_ASP_WORKFLOW_ID,
  VALUE_ASP_AUTONOMOUS_AGENT,
  validatePhase1Contact,
} from "../safeguards";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  intent?: "initial" | "reply" | "followup";
  htmlTemplate?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  from?: string | { name: string; address: string };
  runId?: string;
  phase1LeadId?: string;
  phase1Validated?: boolean;
  isTestRecipient?: boolean;
  origin?: "autonomous_agent" | "manual_human_operator";
}

export interface SendEmailResult {
  sent: boolean;
  messageId?: string;
  error?: string;
}

export async function sendLiveOutreachEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const isEnabled = process.env.CTX_LIVE_EMAIL_DISPATCH === "true";
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!isEnabled) {
    return {
      sent: false,
      error: "Live email dispatch is disabled. Set CTX_LIVE_EMAIL_DISPATCH=true to enable real delivery.",
    };
  }

  if (!user || !pass) {
    return {
      sent: false,
      error: "Missing credentials: GMAIL_USER and GMAIL_APP_PASSWORD must be configured in environment.",
    };
  }

  // Explicit Test-Recipient Boundary vs. Production Phase 1 Cohort Boundary
  const testBoundary = validateTestRecipientBoundary(options.to, options.phase1LeadId);

  if (options.isTestRecipient || testBoundary.isDesignatedTestRecipient) {
    // === EXPLICIT TEST-RECIPIENT BOUNDARY ===
    // Enforces production-launch.txt Item 1.64-66:
    // Only designated controlled inboxes are permitted; arbitrary address bypass is denied.
    if (!testBoundary.valid) {
      return {
        sent: false,
        error: `[TEST_BOUNDARY_REJECTED] ${testBoundary.reason}`,
      };
    }
  } else {
    // === PRODUCTION PHASE 1 COHORT BOUNDARY ===
    // Safeguard: Strict Phase 1 perimeter check
    const phase1Check = validatePhase1Contact({
      email: options.to,
      phase1LeadId: options.phase1LeadId,
      phase1Validated: options.phase1Validated,
    });
    if (!phase1Check.valid && process.env.NODE_ENV !== "test") {
      return {
        sent: false,
        error: phase1Check.reason,
      };
    }

    // Transport is also called by CLI scripts; never trust caller-supplied cohort flags.
    if (process.env.NODE_ENV !== "test") {
      const canonical = await findPhase1LeadByEmail(options.to);
      if (!canonical || canonical.id !== options.phase1LeadId) {
        return { sent: false, error: "Recipient and lead ID do not match the retained Phase 1 corpus." };
      }
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: user.trim(),
        pass: pass.replace(/\s+/g, ""),
      },
    });

    const fromAddress = options.from ?? { name: process.env.CTX_SENDER_NAME ?? "Dylan (ASP Private Capital)", address: user.trim() };

    const headers: Record<string, string> = {
      [HEADER_ASP_ORIGIN]: options.origin ?? VALUE_ASP_AUTONOMOUS_AGENT,
      [HEADER_ASP_AGENT]: "Dylan (ASP Private Capital)",
      [HEADER_ASP_WORKFLOW_ID]: options.runId ?? "unspecified",
      [HEADER_ASP_PHASE1_LEAD]: options.phase1LeadId ?? (testBoundary.isDesignatedTestRecipient ? `lead-${testBoundary.testRecord?.hubspotId}` : "lead-phase1-verified"),
      [HEADER_ASP_PHASE1_VALIDATED]: testBoundary.isDesignatedTestRecipient ? "test-boundary" : "true",
    };

    const info = await transporter.sendMail({
      from: fromAddress,
      to: options.to.trim(),
      subject: options.subject,
      messageId: options.messageId,
      inReplyTo: options.inReplyTo,
      references: options.references,
      text: options.text,
      ...(options.intent === "reply" || options.intent === "followup" ? { html: renderReplyHtml(options.text, options.htmlTemplate) } : {}),
      headers,
    });

    return {
      sent: true,
      messageId: info.messageId,
    };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error sending live email",
    };
  }
}

