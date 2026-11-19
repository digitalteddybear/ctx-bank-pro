import { demoPreferencesSchema } from "@/lib/outreach-demo-preferences";
import { z } from "zod";
import { OutreachStore } from "./store";
import { readReplyTemplate, saveReplyTemplate } from "./reply-template-store";

const storedSchema = demoPreferencesSchema.omit({ replyHtmlTemplate: true })
  .extend({ updatedAt: z.string() });
const key = "demo-preferences";

export function readDemoPreferences(store: OutreachStore) {
  const template = readReplyTemplate(store, "demo");
  const raw = store.setting(key);
  const stored = raw ? storedSchema.parse(JSON.parse(String(raw))) : null;
  const settings = stored ? storedSchema.omit({updatedAt:true}).strip().parse(stored) : null;
  return {
    preferences: stored ? demoPreferencesSchema.parse({ ...settings, replyHtmlTemplate: template.template }) : null,
    template: template.template,
    templateVersion: template.version,
    updatedAt: stored?.updatedAt ?? null,
  };
}

export function saveDemoPreferences(store: OutreachStore, raw: unknown) {
  const value = demoPreferencesSchema.parse(raw);
  return store.transaction(() => {
    const { replyHtmlTemplate, ...settings } = value;
    saveReplyTemplate(store, "demo", replyHtmlTemplate);
    store.setSetting(key, JSON.stringify({ ...settings, updatedAt: new Date().toISOString() }));
    return readDemoPreferences(store);
  });
}
