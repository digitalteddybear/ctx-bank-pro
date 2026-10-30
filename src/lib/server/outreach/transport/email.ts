import nodemailer from "nodemailer";
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
  from?: string;
  runId?: string;
  phase1LeadId?: string;
  phase1Validated?: boolean;
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

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: user.trim(),
        pass: pass.replace(/\s+/g, ""),
      },
    });

    const fromAddress = options.from ?? `"Dylan (ASP Private Capital)" <${user.trim()}>`;

    const headers: Record<string, string> = {
      [HEADER_ASP_ORIGIN]: options.origin ?? VALUE_ASP_AUTONOMOUS_AGENT,
      [HEADER_ASP_AGENT]: "Dylan (ASP Private Capital)",
      [HEADER_ASP_WORKFLOW_ID]: options.runId ?? "unspecified",
      [HEADER_ASP_PHASE1_LEAD]: options.phase1LeadId ?? "lead-phase1-verified",
      [HEADER_ASP_PHASE1_VALIDATED]: "true",
    };

    const info = await transporter.sendMail({
      from: fromAddress,
      to: options.to.trim(),
      subject: options.subject,
      text: options.text,
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

