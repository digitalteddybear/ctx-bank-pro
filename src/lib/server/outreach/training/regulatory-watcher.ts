import { createHash, randomUUID } from "node:crypto";
import type { AdaptationTriggerEvent } from "./types";
import { InteractionHarvester } from "./harvester";

export interface RegulatorySourceSnapshot {
  sourceId: string;
  title: string;
  jurisdiction: string;
  kind: "legislation" | "guidance" | "asp-policy";
  text: string;
  hash: string;
  checkedAt: string;
}

export class RegulatoryWatcher {
  private knownHashes = new Map<string, string>();
  private harvester = new InteractionHarvester();

  constructor(initialSources?: Array<{ id: string; text: string }>) {
    if (initialSources) {
      for (const s of initialSources) {
        this.knownHashes.set(s.id, this.computeHash(s.text));
      }
    }
  }

  private computeHash(text: string): string {
    return createHash("sha256").update(text.trim()).digest("hex");
  }

  /**
   * Inspects an incoming or refreshed source snapshot against known hashes.
   * If a difference is detected, returns an adaptation trigger event and synthetic preference pairs.
   */
  evaluateSource(source: { id: string; title: string; text: string; jurisdiction: string }): {
    changed: boolean;
    triggerEvent?: AdaptationTriggerEvent;
    preferencePairs?: ReturnType<InteractionHarvester["harvestRegulatoryDelta"]>;
  } {
    const newHash = this.computeHash(source.text);
    const existingHash = this.knownHashes.get(source.id);

    if (existingHash && existingHash === newHash) {
      return { changed: false };
    }

    // Hash changed or new source registered
    this.knownHashes.set(source.id, newHash);

    const triggerEvent: AdaptationTriggerEvent = {
      id: randomUUID(),
      source: "regulatory_update",
      agentId: "compliance",
      description: `Regulatory change detected in ${source.title} (${source.id})`,
      payload: {
        sourceId: source.id,
        previousHash: existingHash ?? null,
        newHash,
        jurisdiction: source.jurisdiction,
      },
      timestamp: new Date().toISOString(),
    };

    const statutoryConstraint = `Statutory constraint extracted from updated source ${source.id} (${source.jurisdiction})`;
    const preferencePairs = this.harvester.harvestRegulatoryDelta(source.id, source.text, statutoryConstraint);

    return {
      changed: true,
      triggerEvent,
      preferencePairs,
    };
  }
}
