/**
 * ASP Private Capital - Outreach Safeguarding Protocols
 *
 * Enforces strict perimeters:
 * 1. Phase 1 Lead Validation: Agents interact ONLY with contacts validated & parsed through Phase 1.
 * 2. Non-Interference: Agents NEVER take over conversations not instigated by an agent.
 * 3. Human Operator Protection: Mailbox belongs to the human operator; agent yields immediately
 *    if human takeover is detected (sent mail by human, or prospect mentions human interaction).
 * 4. Dedicated Identification Tags: All agent communications carry explicit origin and workflow headers.
 */

export const HEADER_ASP_ORIGIN = "X-ASP-Origin";
export const VALUE_ASP_AUTONOMOUS_AGENT = "autonomous_agent";
export const VALUE_ASP_MANUAL_OPERATOR = "manual_human_operator";

export const HEADER_ASP_AGENT = "X-ASP-Agent";
export const HEADER_ASP_WORKFLOW_ID = "X-ASP-Workflow-ID";
export const HEADER_ASP_PHASE1_LEAD = "X-ASP-Phase1-Lead";
export const HEADER_ASP_PHASE1_VALIDATED = "X-ASP-Phase1-Validated";

export const TAG_PHASE1_VALIDATED = "phase1_validated";
export const TAG_AGENT_INSTIGATED = "agent_instigated";
export const TAG_HUMAN_MANAGED = "human_managed";
export const TAG_AGENT_YIELDED = "agent_yielded_to_human";

export interface Phase1ValidationResult {
  valid: boolean;
  reason?: string;
  leadId?: string;
}

export function validatePhase1Contact(prospect: {
  id?: string;
  email: string;
  tags?: string[];
  phase1Validated?: boolean;
  phase1LeadId?: string;
}): Phase1ValidationResult {
  const hasPhase1Flag = prospect.phase1Validated === true;
  const hasPhase1Tag = Boolean(prospect.tags?.includes(TAG_PHASE1_VALIDATED));
  const hasLeadIdPrefix = Boolean(prospect.id && prospect.id.startsWith("lead-"));
  const hasPhase1LeadId = Boolean(prospect.phase1LeadId && prospect.phase1LeadId.startsWith("lead-"));

  if (hasPhase1Flag || hasPhase1Tag || hasLeadIdPrefix || hasPhase1LeadId) {
    return {
      valid: true,
      leadId: prospect.phase1LeadId ?? (hasLeadIdPrefix ? prospect.id : undefined),
    };
  }

  return {
    valid: false,
    reason: `PHASE1_UNVALIDATED_RECIPIENT_BLOCKED: Email address '${prospect.email}' has not been validated and parsed through Phase 1. Outreach agents are strictly prohibited from contacting unverified recipients outside the Phase 1 campaign scope.`,
  };
}

export interface HumanTakeoverResult {
  takeoverDetected: boolean;
  reason?: string;
}

export function detectHumanTakeover(
  inboundText: string,
  metadata?: {
    sentByHuman?: boolean;
    operatorAddress?: string;
  }
): HumanTakeoverResult {
  if (metadata?.sentByHuman) {
    return {
      takeoverDetected: true,
      reason: "HUMAN_OPERATOR_INTERVENTION: Manual message sent from mailbox by human operator. Autonomous agent standing down to avoid interference.",
    };
  }

  const humanTakeoverKeywords = [
    /\b(?:our phone call|spoke on the phone|as discussed on the phone|thanks for your call|spoke earlier today|in our meeting|met in person)\b/i,
    /\b(?:spoke to ziggy|thanks ziggy|hi ziggy|per your personal email|your colleague)\b/i,
    /\b(?:speak to a human|talk to a human|human operator|give me a call|call me on|speak with a real person)\b/i,
  ];

  for (const pattern of humanTakeoverKeywords) {
    const match = inboundText.match(pattern);
    if (match) {
      return {
        takeoverDetected: true,
        reason: `HUMAN_OPERATOR_TAKEOVER: Direct human operator interaction detected in thread ('${match[0]}'). Agent yielding control to human mailbox owner.`,
      };
    }
  }

  return { takeoverDetected: false };
}

export function isAgentInstigatedThread(transcript: { direction: string; origin?: string }[]): {
  instigatedByAgent: boolean;
  reason?: string;
} {
  const hasAgentOutbound = transcript.some(
    (t) => t.direction === "outbound" && (t.origin === VALUE_ASP_AUTONOMOUS_AGENT || t.origin === undefined)
  );

  if (!hasAgentOutbound) {
    return {
      instigatedByAgent: false,
      reason: "NON_INTERFERENCE_VIOLATION: Thread was not instigated by an outreach agent. Outreach agents are strictly forbidden from taking over or replying to conversations not initiated by the agent.",
    };
  }

  return { instigatedByAgent: true };
}
