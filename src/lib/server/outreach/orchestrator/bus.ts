import { createHash, randomUUID } from "node:crypto";
import type { AgentMessage, AgentRecipient, AgentSender, InterAgentMessageType } from "./types";

export type MessageHandler = (message: AgentMessage) => Promise<void> | void;

export class AgentMessageBus {
  private subscribers: Map<AgentRecipient, Set<MessageHandler>> = new Map();
  private messageLog: AgentMessage[] = [];
  private maxLogSize = 500;
  private persistentLogger?: (message: AgentMessage) => void;

  setPersistentLogger(logger: (message: AgentMessage) => void): void {
    this.persistentLogger = logger;
  }

  private computeSignature(sender: string, recipient: string, payload: unknown, timestamp: string): string {
    const raw = `${sender}:${recipient}:${JSON.stringify(payload)}:${timestamp}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  subscribe(recipient: AgentRecipient, handler: MessageHandler): () => void {
    if (!this.subscribers.has(recipient)) {
      this.subscribers.set(recipient, new Set());
    }
    this.subscribers.get(recipient)!.add(handler);
    return () => {
      this.subscribers.get(recipient)?.delete(handler);
    };
  }

  async publish(params: {
    sender: AgentSender;
    recipient: AgentRecipient;
    messageType: InterAgentMessageType;
    payload: Record<string, unknown>;
    correlationId?: string;
  }): Promise<AgentMessage> {
    const timestamp = new Date().toISOString();
    const id = `msg-${randomUUID().slice(0, 8)}`;
    const correlationId = params.correlationId ?? `corr-${randomUUID().slice(0, 8)}`;
    const signature = this.computeSignature(params.sender, params.recipient, params.payload, timestamp);

    const message: AgentMessage = {
      id,
      sender: params.sender,
      recipient: params.recipient,
      messageType: params.messageType,
      payload: params.payload,
      correlationId,
      signature,
      timestamp,
    };

    this.messageLog.unshift(message);
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog.pop();
    }

    if (this.persistentLogger) {
      try {
        this.persistentLogger(message);
      } catch {
        // Safe fallback
      }
    }

    // Deliver to targeted recipient subscribers
    const targeted = this.subscribers.get(params.recipient);
    if (targeted) {
      for (const handler of targeted) {
        try {
          await handler(message);
        } catch (err) {
          console.error(`Error in message handler for recipient ${params.recipient}:`, err);
        }
      }
    }

    // Deliver to wildcard subscribers if recipient wasn't already wildcard
    if (params.recipient !== "*") {
      const wildcard = this.subscribers.get("*");
      if (wildcard) {
        for (const handler of wildcard) {
          try {
            await handler(message);
          } catch (err) {
            console.error("Error in wildcard message handler:", err);
          }
        }
      }
    }

    return message;
  }

  getRecentMessages(limit = 50): AgentMessage[] {
    return this.messageLog.slice(0, limit);
  }

  clearHistory(): void {
    this.messageLog = [];
  }
}

let busInstance: AgentMessageBus | null = null;
export function getMessageBus(): AgentMessageBus {
  if (!busInstance) {
    busInstance = new AgentMessageBus();
  }
  return busInstance;
}
