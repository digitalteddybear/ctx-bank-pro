import test from "node:test";
import assert from "node:assert/strict";
import { renderReplyHtml } from "../src/lib/server/outreach/transport/reply-html";
test("reply text is escaped and multiline without replacement-token corruption", () => {
  const html = renderReplyHtml("Hello <Marcus>\n$&", '<table><tr><td>{{message}}</td></tr></table>')!;
  assert.ok(html.includes("Hello &lt;Marcus&gt;<br />"));
  assert.ok(html.includes("$&amp;"));
  assert.ok(!html.includes("{{message}}"));
});
test("branding survives while active content and unsafe links are removed", () => {
  const html = renderReplyHtml("Thanks", '<img src="https://example.com/logo.png" alt="ASP"><p onclick="alert(1)">{{body}}</p><script>alert(2)</script><a href="javascript:alert(1)">Bad</a><a href="https://example.com">Website</a>')!;
  assert.ok(html.includes('src="https://example.com/logo.png"'));
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(!html.includes("onclick"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("alert(2)"));
});
test("missing content placeholder fails explicitly", () => {
  assert.throws(() => renderReplyHtml("Hello", "<p>Logo only</p>"), /include/);
  assert.equal(renderReplyHtml("Hello", ""), undefined);
});

import { OutreachStore } from "../src/lib/server/outreach/store";
import { readReplyTemplate, saveReplyTemplate } from "../src/lib/server/outreach/reply-template-store";
test("templates persist independently and keep immutable history", () => {
  const store = new OutreachStore(":memory:");
  try {
    const campaign = saveReplyTemplate(store, "campaign", "<p>{{message}}</p>");
    const demo = saveReplyTemplate(store, "demo", "<table><tr><td>{{message}}</td></tr></table>");
    assert.equal(campaign.version, 1);
    assert.equal(demo.version, 1);
    assert.equal(readReplyTemplate(store,"campaign").template, "<p>{{message}}</p>");
    assert.equal(saveReplyTemplate(store,"campaign","<p>{{message}}</p>").version, 1);
    assert.equal(saveReplyTemplate(store,"campaign","<div>{{reply}}</div>").version, 2);
    assert.equal(JSON.parse(String(store.setting("reply-template-version:campaign:1"))).template,"<p>{{message}}</p>");
    assert.equal(readReplyTemplate(store,"demo").version, 1);
    assert.throws(()=>saveReplyTemplate(store,"demo","<p>No content</p>"));
    assert.equal(readReplyTemplate(store,"demo").version, 1);
  } finally { store.db.close(); }
});
test("email CSS and responsive tables survive rendering", () => {
  const html = renderReplyHtml("Thanks", '<style>@media(max-width:600px){.email{width:100%}}</style><table class="email" style="width: 600px"><tr><td>{{message}}</td></tr></table>')!;
  assert.ok(html.includes("@media"));
  assert.ok(html.includes('class="email"'));
  assert.ok(!renderReplyHtml("Thanks",'<style>@import "https://example.com/a.css";</style><p>{{message}}</p>')!.includes("@import"));
});
