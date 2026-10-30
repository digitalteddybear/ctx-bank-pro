import test from "node:test";
import assert from "node:assert/strict";
import { getMessageBus } from "../src/lib/server/outreach/orchestrator/bus";
import { getModelRegistry } from "../src/lib/server/outreach/training/registry";
import { SovereignTrainer } from "../src/lib/server/outreach/training/trainer";
import { getOrchestrator } from "../src/lib/server/outreach/orchestrator/orchestrator";
import type { AgentMessage } from "../src/lib/server/outreach/orchestrator/types";

test("AgentMessageBus publishes messages with cryptographic signatures and delivers to subscribers", async () => {
  const bus = getMessageBus();
  const received: AgentMessage[] = [];

  const unsubscribe = bus.subscribe("outreach", (msg) => {
    received.push(msg);
  });

  const sent = await bus.publish({
    sender: "orchestrator",
    recipient: "outreach",
    messageType: "PERIMETER_CONSTRAINT_BROADCAST",
    payload: { testConstraint: "macro_only" },
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].id, sent.id);
  assert.equal(received[0].sender, "orchestrator");
  assert.equal(received[0].recipient, "outreach");
  assert.ok(received[0].signature.length > 20);

  unsubscribe();
});

test("SovereignModelRegistry manages active checkpoints and loss metrics", () => {
  const registry = getModelRegistry();
  const activeOutreach = registry.getActiveCheckpoint("outreach");
  assert.ok(activeOutreach);
  assert.equal(activeOutreach.status, "active");
  assert.equal(activeOutreach.adapterType, "qlora");
  assert.ok(activeOutreach.metrics.finalLoss < 0.5);
  assert.equal(activeOutreach.benchmarkResult?.passed, true);
});

test("SovereignTrainer trains candidate adapter, executes shadow benchmark, and promotes on pass", async () => {
  const trainer = new SovereignTrainer();
  const outcome = await trainer.trainAgent({
    agentId: "conversation",
    targetVersion: "1.1.0",
    samples: [
      {
        id: "sample-1",
        agentId: "conversation",
        instruction: "Classify reply",
        input: "Please stop emailing me",
        output: JSON.stringify({ intent: "opt_out", status: "suppressed" }),
        domain: "reply_classification",
        source: "qa_test",
        createdAt: new Date().toISOString(),
      },
    ],
    epochs: 2,
    autoPromote: true,
  });

  assert.equal(outcome.evaluated, true);
  assert.equal(outcome.promoted, true);
  assert.equal(outcome.checkpoint.version, "1.1.0");
  assert.equal(outcome.checkpoint.status, "active");
  assert.equal(outcome.checkpoint.benchmarkResult?.optOutRecall, 1.0);
  assert.equal(outcome.checkpoint.benchmarkResult?.unsafeSendRate, 0.0);
});

test("MasterOrchestrator processes regulatory update and coordinates autonomous checkpoint promotion", async () => {
  const orchestrator = getOrchestrator();
  const bus = getMessageBus();

  const promotedEvents: AgentMessage[] = [];
  const unsubscribe = bus.subscribe("*", (msg) => {
    if (msg.messageType === "CHECKPOINT_PROMOTED") {
      promotedEvents.push(msg);
    }
  });

  // Simulate regulatory update message arriving at orchestrator
  await bus.publish({
    sender: "regulatory_watcher",
    recipient: "orchestrator",
    messageType: "REGULATORY_UPDATE_DETECTED",
    payload: {
      sourceId: "fca-promotions-2026",
      newHash: "abc123def456",
      jurisdiction: "UK",
    },
  });

  const state = orchestrator.getNetworkState();
  assert.equal(state.orchestratorOnline, true);
  assert.equal(state.autonomousAdaptationEnabled, true);
  assert.ok(state.autonomousTriggersCount >= 1);
  assert.ok(state.promotionsCount >= 1);
  assert.ok(promotedEvents.length >= 1);
  assert.equal(promotedEvents[0].payload.agentId, "compliance");

  unsubscribe();
});
