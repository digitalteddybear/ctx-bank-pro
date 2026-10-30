import type { Agent } from "../types";

export type AdapterType = "lora" | "qlora" | "full" | "cloud_adapter" | "simulation";

export interface PreferencePair {
  id: string;
  agentId: Agent;
  domain: string;
  context: string;
  chosen: string;
  rejected: string;
  source: "human_edit" | "compliance_escalation" | "objection_resolution" | "regulatory_update" | "synthetic_distillation";
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TrainingSample {
  id: string;
  agentId: Agent;
  instruction: string;
  input: string;
  output: string;
  domain: string;
  source: string;
  createdAt: string;
}

export interface LoRAConfig {
  r: number;
  loraAlpha: number;
  loraDropout: number;
  targetModules: string[];
  bias: "none" | "all" | "lora_only";
}

export interface TrainingMetrics {
  epochs: number;
  steps: number;
  initialLoss: number;
  finalLoss: number;
  lossHistory: { step: number; loss: number }[];
  datasetSize: number;
  trainingDurationMs: number;
}

export interface BenchmarkGateResult {
  evaluatedAt: string;
  evaluatedCases: number;
  macroF1: number;
  optOutRecall: number;
  escalationRecall: number;
  unsafeSendRate: number;
  justifiedHoldRate: number;
  citationEntailment: number;
  passed: boolean;
  failureReason?: string;
}

export interface ModelCheckpoint {
  id: string;
  agentId: Agent;
  version: string;
  baseModel: string;
  adapterType: AdapterType;
  adapterPath: string;
  loraConfig?: LoRAConfig;
  metrics: TrainingMetrics;
  benchmarkResult?: BenchmarkGateResult;
  status: "candidate" | "active" | "deprecated" | "rejected";
  promotedAt?: string;
  createdAt: string;
}

export type AutonomousTriggerSource =
  | "prospect_interaction"
  | "regulatory_update"
  | "internal_operations"
  | "operator_manual";

export interface AdaptationTriggerEvent {
  id: string;
  source: AutonomousTriggerSource;
  agentId?: Agent;
  description: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
