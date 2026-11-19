import { z } from "zod";
import { OutreachStore } from "./store";
import { renderReplyHtml } from "./transport/reply-html";

export const templateScope = z.enum(["campaign", "demo"]);
export type TemplateScope = z.infer<typeof templateScope>;
export function readReplyTemplate(store: OutreachStore, scope: TemplateScope) {
  const raw = store.setting("reply-template:" + scope);
  return raw ? z.object({ version: z.number().int().positive(), template: z.string(), savedAt: z.string() }).parse(JSON.parse(String(raw)))
    : { version: 0, template: "", savedAt: null };
}
export function saveReplyTemplate(store: OutreachStore, scope: TemplateScope, template: string) {
  if (template.trim()) renderReplyHtml("Template preview", template);
  return store.transaction(() => {
    const previous = readReplyTemplate(store, scope);
    if (previous.version && previous.template === template) return previous;
    const saved = { version: previous.version + 1, template, savedAt: new Date().toISOString() };
    store.setSetting("reply-template:" + scope, JSON.stringify(saved));
    store.setSetting("reply-template-version:" + scope + ":" + saved.version, JSON.stringify(saved));
    if (scope === "campaign") store.setSetting("reply-html-template", template);
    store.event("templates", "reply_template_saved", { scope, version: saved.version });
    return saved;
  });
}

export function runReplyTemplate(store: OutreachStore, runId: string): string {
  const run=store.get(runId);
  const saved=store.setting("reply-html-template:"+runId);
  const fallback=run.campaignId ? "" : store.setting("reply-html-template") ?? process.env.CTX_REPLY_HTML_TEMPLATE ?? "";
  return String(saved ?? fallback);
}
