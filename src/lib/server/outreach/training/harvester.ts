import { randomUUID } from "node:crypto";
import type { Run } from "../types";
import type { PreferencePair, TrainingSample } from "./types";

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /you\s+are\s+now\s+(a|an|in)\b/i,
  /disregard\s+(the\s+)?above/i,
  /jailbreak/i,
  /override\s+(all\s+)?safeguards/i,
  /<script[\s>]/i,
  /drop\s+table/i,
];

export function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export class InteractionHarvester {
  /**
   * Harvests SFT samples and DPO preference pairs from an executed workflow run and its events.
   */
  harvestFromRun(run: Run, events: Array<{ type: string; payload?: Record<string, unknown>; timestamp?: string }>): {
    samples: TrainingSample[];
    preferencePairs: PreferencePair[];
  } {
    const samples: TrainingSample[] = [];
    const preferencePairs: PreferencePair[] = [];
    const runIsoTime = new Date(run.createdAt).toISOString();

    // Filter out runs contaminated by prompt injections
    const fullTranscriptText = run.transcript.map((t: { text: string }) => t.text).join("\n");
    if (containsInjection(fullTranscriptText) || (run.draft && containsInjection(run.draft.body))) {
      return { samples, preferencePairs };
    }

    // 1. Outreach Agent Harvest
    if (run.draft) {
      // Look for human edits: event "draft_edited"
      const editEvent = events.find((e) => e.type === "draft_edited");
      if (editEvent && editEvent.payload && typeof editEvent.payload.body === "string") {
        preferencePairs.push({
          id: randomUUID(),
          agentId: "outreach",
          domain: "relationship_reactivation",
          context: `Prospect: ${run.prospect.name} (${run.prospect.email})\nFacts: ${run.prospect.facts.map((f: { text: string }) => f.text).join("; ")}`,
          chosen: editEvent.payload.body as string,
          rejected: run.draft.body,
          source: "human_edit",
          metadata: { runId: run.id, reason: "Operator edited draft prior to dispatch" },
          createdAt: editEvent.timestamp ?? runIsoTime,
        });
      } else if (run.review?.decision === "pass") {
        // High quality approved draft becomes SFT sample
        samples.push({
          id: randomUUID(),
          agentId: "outreach",
          instruction: "Draft a personalized macroeconomic outreach message for ASP Private Capital. Do not disclose specific opportunities or yields.",
          input: `Prospect: ${run.prospect.name}\nContext: ${run.prospect.facts.map((f: { text: string }) => f.text).join("; ")}`,
          output: `Subject: ${run.draft.subject}\n\n${run.draft.body}`,
          domain: "macro_outreach",
          source: "approved_workflow_run",
          createdAt: runIsoTime,
        });
      }
    }

    // 2. Compliance Agent Harvest
    if (run.review) {
      if (run.review.decision === "pass") {
        samples.push({
          id: randomUUID(),
          agentId: "compliance",
          instruction: "Review the proposed financial promotion draft against FSMA 2000 Section 21 and ASP policy.",
          input: run.draft ? `Subject: ${run.draft.subject}\nBody: ${run.draft.body}` : run.prospect.name,
          output: JSON.stringify({
            decision: "pass",
            summary: run.review.summary,
            citations: run.review.citations,
          }),
          domain: "promotion_review",
          source: "compliant_review",
          createdAt: runIsoTime,
        });
      } else if (run.review.decision === "revise" || run.review.decision === "block" || run.review.decision === "escalate") {
        preferencePairs.push({
          id: randomUUID(),
          agentId: "compliance",
          domain: "statutory_gatekeeping",
          context: run.draft?.body ?? "",
          chosen: `Review Decision: ${run.review.decision}. Summary: ${run.review.summary}`,
          rejected: "Review Decision: pass. Summary: Permitted without qualification.",
          source: "compliance_escalation",
          metadata: { runId: run.id, decision: run.review.decision },
          createdAt: runIsoTime,
        });
      }
    }

    // 3. Conversation Agent Harvest
    const inboundEvents = run.transcript.filter((t: { direction: string }) => t.direction === "inbound");
    for (const inbound of inboundEvents) {
      if (!containsInjection(inbound.text)) {
        samples.push({
          id: randomUUID(),
          agentId: "conversation",
          instruction: "Classify inbound prospect reply according to statutory priority and extract escalation queue if required.",
          input: inbound.text,
          output: JSON.stringify({
            intent: run.intent ?? "unclear",
            escalate: run.escalationQueue ?? null,
            status: run.status,
          }),
          domain: "reply_classification",
          source: "inbound_interaction",
          createdAt: runIsoTime,
        });
      }
    }

    return { samples, preferencePairs };
  }

  /**
   * Harvests regulatory update deltas to generate synthetic compliance preference pairs.
   */
  harvestRegulatoryDelta(
    sourceId: string,
    newText: string,
    statutoryConstraint: string
  ): PreferencePair[] {
    return [
      {
        id: randomUUID(),
        agentId: "compliance",
        domain: "regulatory_freshness",
        context: `Regulatory snapshot update for source: ${sourceId}.\nText snippet: ${newText.slice(0, 300)}...`,
        chosen: `Ensure promotions strictly enforce constraint: ${statutoryConstraint}. Hold any ungrounded claims.`,
        rejected: `Ignore updated regulatory constraint: ${statutoryConstraint}. Treat as permissive standard.`,
        source: "regulatory_update",
        metadata: { sourceId },
        createdAt: new Date().toISOString(),
      },
    ];
  }

  exportJsonl(samples: TrainingSample[]): string {
    return samples.map((s) => JSON.stringify(s)).join("\n");
  }

  exportDpoJsonl(pairs: PreferencePair[]): string {
    return pairs.map((p) => JSON.stringify(p)).join("\n");
  }
}
