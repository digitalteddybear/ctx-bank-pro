import type { Agent } from "../types";

export type AgentSender = Agent | "orchestrator" | "regulatory_watcher" | "system";
export type AgentRecipient = Agent | "orchestrator" | "*";

export type InterAgentMessageType =
  | "REGULATORY_UPDATE_DETECTED"
  | "PERIMETER_CONSTRAINT_BROADCAST"
  | "PROSPECT_OBJECTION_PROPAGATED"
  | "PROSPECT_INTENT_PROPAGATED"
  | "HUMAN_TAKEOVER_DETECTED"
  | "PERIMETER_VALIDATION_FAILED"
  | "CONSENSUS_REQUEST"
  | "CONSENSUS_RESPONSE"
  | "AUTONOMOUS_TRAINING_TRIGGERED"
  | "CHECKPOINT_PROMOTED"
  | "ESCALATION_COORDINATED"
  | "WORKFLOW_INITIATED"
  | "GATE_APPROVAL_GRANTED";

export interface AgentMessage {
  id: string;
  sender: AgentSender;
  recipient: AgentRecipient;
  messageType: InterAgentMessageType;
  payload: Record<string, unknown>;
  correlationId: string;
  signature: string;
  timestamp: string;
}

export interface InterAgentDialogue {
  topic: string;
  correlationId: string;
  participants: AgentSender[];
  messages: AgentMessage[];
  resolved: boolean;
  resolutionSummary?: string;
  resolvedAt?: string;
}
