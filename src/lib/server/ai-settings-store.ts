import { z } from "zod";
import { aiSettingsSchema, aiSettingsSnapshotSchema, DEFAULT_AI_SETTINGS } from "@/lib/ai-settings";
import type { OutreachStore } from "./outreach/store";

const key = "ai-workspace-settings";
export class SettingsConflict extends Error {}
export function readAISettings(store: OutreachStore) {
  const raw = store.setting(key);
  if (raw) return aiSettingsSnapshotSchema.parse(JSON.parse(String(raw)));
  const outreach = store.setting("lead-outreach-settings");
  const legacy = outreach ? aiSettingsSchema.parse(JSON.parse(String(outreach))) : null;
  return { settings: { ...DEFAULT_AI_SETTINGS, models: { ...DEFAULT_AI_SETTINGS.models,
    leadOutreach: legacy?.models.leadOutreach ?? DEFAULT_AI_SETTINGS.models.leadOutreach } }, revision: 0, updatedAt: null };
}
export function saveAISettings(store: OutreachStore, raw: unknown) {
  const input = z.object({settings:aiSettingsSchema,revision:z.number().int().nonnegative()}).strict().parse(raw);
  return store.transaction(() => {
    const previous = readAISettings(store);
    if (input.revision !== previous.revision) throw new SettingsConflict("Settings changed in another session. Reload before saving.");
    const saved = {settings:input.settings,revision:previous.revision+1,updatedAt:new Date().toISOString()};
    store.setSetting(key,JSON.stringify(saved));
    return saved;
  });
}
