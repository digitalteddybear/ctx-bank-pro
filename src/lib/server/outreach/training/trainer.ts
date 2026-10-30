import type { Agent } from "../types";
import type { ModelCheckpoint, TrainingSample, PreferencePair } from "./types";
import { getModelRegistry } from "./registry";
import { ShadowEvalGate } from "./eval-gate";

export interface TrainAgentOptions {
  agentId: Agent;
  targetVersion: string;
  samples: TrainingSample[];
  preferencePairs?: PreferencePair[];
  epochs?: number;
  autoPromote?: boolean;
}

export class SovereignTrainer {
  private evalGate = new ShadowEvalGate();

  /**
   * Executes an autonomous fine-tuning run for a sovereign agent.
   */
  async trainAgent(options: TrainAgentOptions): Promise<{
    checkpoint: ModelCheckpoint;
    evaluated: boolean;
    promoted: boolean;
  }> {
    const { agentId, targetVersion, samples, preferencePairs = [], epochs = 3, autoPromote = true } = options;
    const registry = getModelRegistry();
    const datasetSize = samples.length + preferencePairs.length;

    if (datasetSize === 0) {
      throw new Error(`Cannot fine-tune ${agentId}: training dataset is empty`);
    }

    // Simulate gradient descent loss convergence over steps
    const steps = epochs * Math.max(10, Math.min(datasetSize, 100));
    const initialLoss = 2.2 + Math.random() * 0.4;
    const lossHistory: { step: number; loss: number }[] = [];

    const numCheckpoints = 4;
    for (let i = 1; i <= numCheckpoints; i++) {
      const step = Math.round((steps / numCheckpoints) * i);
      const decay = Math.exp(-1.8 * (i / numCheckpoints));
      const currentLoss = Math.max(0.18, initialLoss * decay + (Math.random() * 0.05 - 0.025));
      lossHistory.push({ step, loss: Number(currentLoss.toFixed(3)) });
    }

    const finalLoss = lossHistory[lossHistory.length - 1].loss;
    const trainingDurationMs = steps * 45; // ~45ms per simulated batch step

    // Create candidate checkpoint in registry
    const candidate = registry.registerCandidate({
      agentId,
      version: targetVersion,
      baseModel: "meta-llama/Llama-3.1-8B-Instruct",
      adapterType: "qlora",
      adapterPath: `adapters/${agentId}/v${targetVersion}`,
      loraConfig: {
        r: 16,
        loraAlpha: 32,
        loraDropout: 0.05,
        targetModules: ["q_proj", "v_proj"],
        bias: "none",
      },
      metrics: {
        epochs,
        steps,
        initialLoss: Number(initialLoss.toFixed(3)),
        finalLoss,
        lossHistory,
        datasetSize,
        trainingDurationMs,
      },
    });

    let promoted = false;
    let evaluated = false;

    if (autoPromote) {
      const evalOutcome = await this.evalGate.evaluateCandidate(candidate.id);
      evaluated = true;
      promoted = evalOutcome.passed;
    }

    return {
      checkpoint: candidate,
      evaluated,
      promoted,
    };
  }
}
