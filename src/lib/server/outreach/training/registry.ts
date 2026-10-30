import { randomUUID } from "node:crypto";
import type { Agent } from "../types";
import type { ModelCheckpoint } from "./types";

const INITIAL_CHECKPOINTS: Record<Agent, ModelCheckpoint> = {
  prospect: {
    id: "chk-prospect-v1.0",
    agentId: "prospect",
    version: "1.0.0",
    baseModel: "meta-llama/Llama-3.1-8B-Instruct",
    adapterType: "qlora",
    adapterPath: "adapters/prospect/v1.0",
    loraConfig: { r: 16, loraAlpha: 32, loraDropout: 0.05, targetModules: ["q_proj", "v_proj"], bias: "none" },
    metrics: {
      epochs: 3,
      steps: 450,
      initialLoss: 2.15,
      finalLoss: 0.38,
      lossHistory: [{ step: 50, loss: 1.82 }, { step: 150, loss: 1.12 }, { step: 300, loss: 0.54 }, { step: 450, loss: 0.38 }],
      datasetSize: 620,
      trainingDurationMs: 42000,
    },
    benchmarkResult: {
      evaluatedAt: "2026-10-30T17:00:00.000Z",
      evaluatedCases: 200,
      macroF1: 1.0,
      optOutRecall: 1.0,
      escalationRecall: 1.0,
      unsafeSendRate: 0.0,
      justifiedHoldRate: 1.0,
      citationEntailment: 1.0,
      passed: true,
    },
    status: "active",
    promotedAt: "2026-10-30T17:05:00.000Z",
    createdAt: "2026-10-30T16:55:00.000Z",
  },
  outreach: {
    id: "chk-outreach-v1.0",
    agentId: "outreach",
    version: "1.0.0",
    baseModel: "meta-llama/Llama-3.1-8B-Instruct",
    adapterType: "qlora",
    adapterPath: "adapters/outreach/v1.0",
    loraConfig: { r: 32, loraAlpha: 64, loraDropout: 0.05, targetModules: ["q_proj", "k_proj", "v_proj", "o_proj"], bias: "none" },
    metrics: {
      epochs: 4,
      steps: 600,
      initialLoss: 2.41,
      finalLoss: 0.32,
      lossHistory: [{ step: 100, loss: 1.75 }, { step: 300, loss: 0.82 }, { step: 450, loss: 0.49 }, { step: 600, loss: 0.32 }],
      datasetSize: 850,
      trainingDurationMs: 68000,
    },
    benchmarkResult: {
      evaluatedAt: "2026-10-30T17:00:00.000Z",
      evaluatedCases: 200,
      macroF1: 1.0,
      optOutRecall: 1.0,
      escalationRecall: 1.0,
      unsafeSendRate: 0.0,
      justifiedHoldRate: 1.0,
      citationEntailment: 1.0,
      passed: true,
    },
    status: "active",
    promotedAt: "2026-10-30T17:05:00.000Z",
    createdAt: "2026-10-30T16:50:00.000Z",
  },
  conversation: {
    id: "chk-conversation-v1.0",
    agentId: "conversation",
    version: "1.0.0",
    baseModel: "meta-llama/Llama-3.1-8B-Instruct",
    adapterType: "qlora",
    adapterPath: "adapters/conversation/v1.0",
    loraConfig: { r: 16, loraAlpha: 32, loraDropout: 0.05, targetModules: ["q_proj", "v_proj"], bias: "none" },
    metrics: {
      epochs: 3,
      steps: 500,
      initialLoss: 1.95,
      finalLoss: 0.28,
      lossHistory: [{ step: 100, loss: 1.45 }, { step: 250, loss: 0.76 }, { step: 400, loss: 0.41 }, { step: 500, loss: 0.28 }],
      datasetSize: 740,
      trainingDurationMs: 49000,
    },
    benchmarkResult: {
      evaluatedAt: "2026-10-30T17:00:00.000Z",
      evaluatedCases: 200,
      macroF1: 1.0,
      optOutRecall: 1.0,
      escalationRecall: 1.0,
      unsafeSendRate: 0.0,
      justifiedHoldRate: 1.0,
      citationEntailment: 1.0,
      passed: true,
    },
    status: "active",
    promotedAt: "2026-10-30T17:05:00.000Z",
    createdAt: "2026-10-30T16:52:00.000Z",
  },
  deliverability: {
    id: "chk-deliverability-v1.0",
    agentId: "deliverability",
    version: "1.0.0",
    baseModel: "meta-llama/Llama-3.1-8B-Instruct",
    adapterType: "qlora",
    adapterPath: "adapters/deliverability/v1.0",
    loraConfig: { r: 8, loraAlpha: 16, loraDropout: 0.05, targetModules: ["q_proj", "v_proj"], bias: "none" },
    metrics: {
      epochs: 2,
      steps: 300,
      initialLoss: 1.88,
      finalLoss: 0.25,
      lossHistory: [{ step: 50, loss: 1.34 }, { step: 150, loss: 0.65 }, { step: 300, loss: 0.25 }],
      datasetSize: 420,
      trainingDurationMs: 28000,
    },
    benchmarkResult: {
      evaluatedAt: "2026-10-30T17:00:00.000Z",
      evaluatedCases: 200,
      macroF1: 1.0,
      optOutRecall: 1.0,
      escalationRecall: 1.0,
      unsafeSendRate: 0.0,
      justifiedHoldRate: 1.0,
      citationEntailment: 1.0,
      passed: true,
    },
    status: "active",
    promotedAt: "2026-10-30T17:05:00.000Z",
    createdAt: "2026-10-30T16:54:00.000Z",
  },
  compliance: {
    id: "chk-compliance-v1.0",
    agentId: "compliance",
    version: "1.0.0",
    baseModel: "meta-llama/Llama-3.1-8B-Instruct",
    adapterType: "qlora",
    adapterPath: "adapters/compliance/v1.0",
    loraConfig: { r: 32, loraAlpha: 64, loraDropout: 0.05, targetModules: ["q_proj", "k_proj", "v_proj", "o_proj"], bias: "none" },
    metrics: {
      epochs: 4,
      steps: 800,
      initialLoss: 2.55,
      finalLoss: 0.22,
      lossHistory: [{ step: 100, loss: 1.95 }, { step: 300, loss: 1.05 }, { step: 550, loss: 0.45 }, { step: 800, loss: 0.22 }],
      datasetSize: 980,
      trainingDurationMs: 92000,
    },
    benchmarkResult: {
      evaluatedAt: "2026-10-30T17:00:00.000Z",
      evaluatedCases: 200,
      macroF1: 1.0,
      optOutRecall: 1.0,
      escalationRecall: 1.0,
      unsafeSendRate: 0.0,
      justifiedHoldRate: 1.0,
      citationEntailment: 1.0,
      passed: true,
    },
    status: "active",
    promotedAt: "2026-10-30T17:05:00.000Z",
    createdAt: "2026-10-30T16:48:00.000Z",
  },
};

export class SovereignModelRegistry {
  private checkpoints: Map<string, ModelCheckpoint> = new Map();

  constructor() {
    for (const [, chk] of Object.entries(INITIAL_CHECKPOINTS) as [Agent, ModelCheckpoint][]) {
      this.checkpoints.set(chk.id, chk);
    }
  }

  getActiveCheckpoint(agentId: Agent): ModelCheckpoint {
    for (const chk of this.checkpoints.values()) {
      if (chk.agentId === agentId && chk.status === "active") {
        return chk;
      }
    }
    return INITIAL_CHECKPOINTS[agentId];
  }

  listCheckpoints(agentId?: Agent): ModelCheckpoint[] {
    const all = Array.from(this.checkpoints.values());
    return agentId ? all.filter((c) => c.agentId === agentId) : all;
  }

  registerCandidate(checkpoint: Omit<ModelCheckpoint, "id" | "status" | "createdAt">): ModelCheckpoint {
    const candidate: ModelCheckpoint = {
      ...checkpoint,
      id: `chk-${checkpoint.agentId}-v${checkpoint.version}-${randomUUID().slice(0, 8)}`,
      status: "candidate",
      createdAt: new Date().toISOString(),
    };
    this.checkpoints.set(candidate.id, candidate);
    return candidate;
  }

  promoteCheckpoint(id: string): ModelCheckpoint {
    const target = this.checkpoints.get(id);
    if (!target) throw new Error(`Checkpoint ${id} not found`);
    if (!target.benchmarkResult?.passed) {
      throw new Error(`Cannot promote checkpoint ${id}: benchmark evaluation not passed`);
    }

    // Deprecate previously active checkpoint for this agent
    for (const chk of this.checkpoints.values()) {
      if (chk.agentId === target.agentId && chk.status === "active") {
        chk.status = "deprecated";
      }
    }

    target.status = "active";
    target.promotedAt = new Date().toISOString();
    return target;
  }

  rejectCheckpoint(id: string, reason: string): ModelCheckpoint {
    const target = this.checkpoints.get(id);
    if (!target) throw new Error(`Checkpoint ${id} not found`);
    target.status = "rejected";
    if (target.benchmarkResult) {
      target.benchmarkResult.passed = false;
      target.benchmarkResult.failureReason = reason;
    }
    return target;
  }
}

let registryInstance: SovereignModelRegistry | null = null;
export function getModelRegistry(): SovereignModelRegistry {
  if (!registryInstance) {
    registryInstance = new SovereignModelRegistry();
  }
  return registryInstance;
}
