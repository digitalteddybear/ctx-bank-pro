import type { Agent } from "../types";
import { AGENTS } from "../types";
import type { AgentMessage } from "./types";
import { getMessageBus } from "./bus";
import { getModelRegistry } from "../training/registry";
import { SovereignTrainer } from "../training/trainer";
import { InteractionHarvester } from "../training/harvester";

export interface NetworkState {
  orchestratorOnline: boolean;
  activeAgents: Agent[];
  autonomousAdaptationEnabled: boolean;
  totalMessagesProcessed: number;
  autonomousTriggersCount: number;
  promotionsCount: number;
  recentMessages: AgentMessage[];
}

export class MasterOrchestrator {
  private bus = getMessageBus();
  private registry = getModelRegistry();
  private trainer = new SovereignTrainer();
  private harvester = new InteractionHarvester();
  private initialized = false;

  private totalMessages = 0;
  private autonomousTriggers = 0;
  private promotions = 0;

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Listen to messages destined for orchestrator or broadcast
    this.bus.subscribe("orchestrator", async (msg) => {
      this.totalMessages++;
      await this.handleOrchestratorMessage(msg);
    });

    this.bus.subscribe("*", () => {
      this.totalMessages++;
    });
  }

  private async handleOrchestratorMessage(msg: AgentMessage): Promise<void> {
    switch (msg.messageType) {
      case "REGULATORY_UPDATE_DETECTED": {
        this.autonomousTriggers++;
        const { sourceId, newHash, jurisdiction } = msg.payload as { sourceId: string; newHash: string; jurisdiction: string };

        // 1. Broadcast updated perimeter constraint to all sovereign agents
        await this.bus.publish({
          sender: "orchestrator",
          recipient: "*",
          messageType: "PERIMETER_CONSTRAINT_BROADCAST",
          correlationId: msg.correlationId,
          payload: {
            alert: `Regulatory update in ${sourceId} (${jurisdiction}) codified into runtime perimeter`,
            sourceId,
            newHash,
          },
        });

        // 2. Trigger autonomous fine-tuning on candidate weights for compliance
        const syntheticPairs = this.harvester.harvestRegulatoryDelta(
          sourceId,
          `Statutory source ${sourceId} text updated to hash ${newHash}`,
          `Enforce new statutory requirements under ${sourceId}`
        );

        const syntheticSamples = [
          {
            id: `sample-${sourceId}`,
            agentId: "compliance" as Agent,
            instruction: `Review draft against updated ${sourceId} guidelines.`,
            input: `Promotion text evaluated under updated ${sourceId}`,
            output: JSON.stringify({ decision: "pass", constraintEnforced: sourceId }),
            domain: "statutory_freshness",
            source: "regulatory_watcher",
            createdAt: new Date().toISOString(),
          },
        ];

        try {
          const outcome = await this.trainer.trainAgent({
            agentId: "compliance",
            targetVersion: "1.1.0",
            samples: syntheticSamples,
            preferencePairs: syntheticPairs,
            epochs: 2,
            autoPromote: true,
          });

          if (outcome.promoted) {
            this.promotions++;
            await this.bus.publish({
              sender: "orchestrator",
              recipient: "*",
              messageType: "CHECKPOINT_PROMOTED",
              correlationId: msg.correlationId,
              payload: {
                agentId: "compliance",
                checkpointId: outcome.checkpoint.id,
                version: outcome.checkpoint.version,
                status: "active",
                benchmarkPassed: true,
              },
            });
          }
        } catch (err) {
          console.error("Autonomous adaptation pipeline error:", err);
        }
        break;
      }

      case "PROSPECT_OBJECTION_PROPAGATED": {
        this.autonomousTriggers++;
        // Relay objection intelligence to outreach agent so future macro drafts anticipate the question
        await this.bus.publish({
          sender: "orchestrator",
          recipient: "outreach",
          messageType: "PERIMETER_CONSTRAINT_BROADCAST",
          correlationId: msg.correlationId,
          payload: {
            directive: "Incorporate macro liquidity explanation into future private equity context",
            objectionPattern: msg.payload.objectionPattern,
          },
        });
        break;
      }

      case "CONSENSUS_REQUEST": {
        // Inter-agent debate resolution: orchestrator mediates ambiguous boundary
        const { topic, sourceAgent, query } = msg.payload as { topic: string; sourceAgent: Agent; query: string };
        const resolution = `Orchestrator resolved consensus for ${topic}: statutory safety priority enforced; request routed to named human queue if ambiguous.`;

        await this.bus.publish({
          sender: "orchestrator",
          recipient: sourceAgent,
          messageType: "CONSENSUS_RESPONSE",
          correlationId: msg.correlationId,
          payload: {
            topic,
            query,
            resolution,
            decision: "escalate_to_human",
          },
        });
        break;
      }

      default:
        break;
    }
  }

  /**
   * Broadcasts a real-world external event to sovereign agents.
   */
  async broadcastExternalEvent(event: {
    source: "regulatory" | "macro_market" | "company_policy";
    title: string;
    description: string;
    details: Record<string, unknown>;
  }): Promise<AgentMessage> {
    return this.bus.publish({
      sender: "orchestrator",
      recipient: "*",
      messageType: "PERIMETER_CONSTRAINT_BROADCAST",
      payload: {
        externalEventSource: event.source,
        title: event.title,
        description: event.description,
        ...event.details,
      },
    });
  }

  getNetworkState(): NetworkState {
    return {
      orchestratorOnline: true,
      activeAgents: [...AGENTS],
      autonomousAdaptationEnabled: true,
      totalMessagesProcessed: this.totalMessages,
      autonomousTriggersCount: this.autonomousTriggers,
      promotionsCount: this.promotions,
      recentMessages: this.bus.getRecentMessages(30),
    };
  }
}

let orchestratorInstance: MasterOrchestrator | null = null;
export function getOrchestrator(): MasterOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new MasterOrchestrator();
  }
  return orchestratorInstance;
}
