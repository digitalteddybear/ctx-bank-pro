import { deliverControlledDemoReply } from "../src/lib/server/outreach/transport/imap";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { OutreachEngine } from "../src/lib/server/outreach/engine";
import { OutreachStore } from "../src/lib/server/outreach/store";
import { FixtureModel, ConfigurableModel, outreachModelConfig } from "../src/lib/server/outreach/models";
import { approveSource, importSource, seedFixtureSources, usableSources } from "../src/lib/server/outreach/sources";
import { MAX_SOURCE_AGE, type Agent, type ModelAdapter } from "../src/lib/server/outreach/types";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/agents/[[...segments]]/route";
import { phase1SandboxProspect } from "../src/lib/server/outreach/phase1";
import { loadLeadGraph } from "../src/lib/server/lead-corpus";

// Keep CRM-context enrichment incidental writes in an isolated in-memory store.
process.env.CTX_OUTREACH_DB_PATH = ":memory:";

test("agent API denies reads and mutations without a configured operator credential", async () => {
  const previous = process.env.CTX_OUTREACH_OPERATOR_TOKEN;
  try {
    delete process.env.CTX_OUTREACH_OPERATOR_TOKEN;
    const context = { params: Promise.resolve({}) };
    assert.equal((await GET(new NextRequest("http://localhost/api/agents"), context)).status, 401);
    assert.equal((await POST(new NextRequest("http://localhost/api/agents", { method: "POST" }), context)).status, 401);
    process.env.CTX_OUTREACH_OPERATOR_TOKEN = "synthetic-test-operator-token-only";
    assert.equal((await GET(new NextRequest("http://localhost/api/agents", { headers: { authorization: "Bearer wrong" } }), context)).status, 401);
    const response = await POST(new NextRequest("http://localhost/api/agents", { method: "POST", headers: { authorization: `Bearer ${process.env.CTX_OUTREACH_OPERATOR_TOKEN}`, "content-type": "application/json" }, body: '{"action":"invented"}' }), context);
    assert.equal(response.status, 400);
  } finally {
    if (previous === undefined) delete process.env.CTX_OUTREACH_OPERATOR_TOKEN;
    else process.env.CTX_OUTREACH_OPERATOR_TOKEN = previous;
  }
});

test("real-contact sandbox can use a complete dossier while never enabling external delivery", async () => {
  const { engine: e, store: s } = make();
  const id = e.createSandbox({ id: "lead-real-1", name: "Recorded Contact", email: "recorded.contact@real-domain.test", permission: "unknown", facts: [{ text: "Classification: private equity interest", source: "dossier-lead-real-1" }], dossier: "# HubSpot ID: `real-1`\n- **Raw Email:** recorded.contact@real-domain.test\n- **Classification:** PRIVATE_EQUITY (Confidence: 0.91)\n- **Investor Fit Hypothesis:** Historical evidence only\n- **Reachability Tier:** EMAIL_ONLY_REACHABLE" }).id;
  await drain(e);
  assert.equal(s.get(id).sandbox, true);
  assert.equal(s.get(id).status, "awaiting_approval");
  assert.equal(s.get(id).prospect.email, "recorded.contact@real-domain.test");
  assert.equal(s.get(id).draft?.body.includes("PRIVATE_EQUITY"), true);
  e.approve(id, s.get(id).draft!.hash, "sandbox-reviewer"); await drain(e);
  const dispatch = s.events(id).find(event => event.kind === "sandbox_simulated_dispatch");
  assert.equal(Boolean(dispatch), true);
  assert.equal((dispatch?.data as { externalDelivery?: boolean }).externalDelivery, false);
  s.close();
});

test("the actual Phase 1 knowledge bank can populate a sandbox run", async () => {
  const firstLead = (await loadLeadGraph()).nodes.find(node => node.id.startsWith("lead-"));
  assert.ok(firstLead);
  const profile = await phase1SandboxProspect(firstLead.id);
  assert.ok(profile.dossier.length > 1000);
  assert.ok(profile.facts.length > 10);
  const { engine: e, store: s } = make();
  const id = e.createSandbox(profile).id;
  await drain(e);
  const run = s.get(id);
  assert.equal(run.sandbox, true);
  assert.equal(run.synthetic, false);
  assert.equal(run.prospect.email, profile.email);
  assert.equal((run.prospect as { dossier: string }).dossier, profile.dossier);
  assert.equal(run.status, "awaiting_approval");
  s.close();
});

const prospect = () => ({ id: "synthetic-1", name: "Alex Example", email: "alex@example.test", permission: "granted", facts: [{ text: "Synthetic contact asked to discuss interests.", source: "synthetic-profile" }] });
const make = (model: ModelAdapter = new FixtureModel()) => { const store = new OutreachStore(":memory:"); seedFixtureSources(store); return { store, engine: new OutreachEngine(store, model) }; };
const drain = async (engine: OutreachEngine) => { for (let i = 0; i < 30 && await engine.tick(); i++); };
const outbox = (store: OutreachStore) => Number(store.db.prepare("SELECT count(*) AS n FROM outbox").get()?.n);
class OverrideModel extends FixtureModel {
  constructor(readonly change: (agent: Agent, context: Record<string, unknown>, result: unknown) => unknown | Promise<unknown>) { super(); }
  override async invoke(agent: Agent, context: Record<string, unknown>) { return this.change(agent, context, await super.invoke(agent, context)); }
}

test("opening template does not require reply-level adviser disclaimer", async () => {
  const { engine: e, store: s } = make();
  const openingMessage = "Hello {{First name}},\n\nWe act as an introducer and liaison, connecting qualifying investors with providers and coordinating documentation. If private markets remain on your radar, you are welcome to reach me directly here.\n\nKind regards,\n{{Sender}}\nASP Private Capital\n\nIf you would prefer no further emails, please let me know.";
  s.db.prepare("INSERT INTO outreach_preferences(key,value,updated_at) VALUES('campaign',?,?)").run(JSON.stringify({openingMessage,standardFooter:"",replyObjectives:[],replyRules:[]}),new Date().toISOString());
  const id=e.create(prospect()).id;
  await drain(e);
  const run=s.get(id);
  assert.equal(run.status,"awaiting_approval",run.issue??"opening should reach operator review");
  assert.equal(run.draft?.body.includes("not an adviser"),false);
  assert.equal(run.draft?.body.includes("{{First name}}"),false);
  s.close();
});

test("human-reviewed journey, interest, booking, dedupe, reschedule and cancellation", async () => {
  const { engine: e, store: s } = make();
  const id = e.create(prospect()).id; await drain(e);
  assert.equal(s.get(id).status, "awaiting_approval"); assert.equal(outbox(s), 0);
  assert.equal(s.get(id).deliverability?.decision, "pass");
  assert.ok(s.get(id).deliverability?.checks.some(check => check.id === "authentication" && check.status === "warn"));
  e.approve(id, s.get(id).draft!.hash, "operator"); await drain(e); assert.equal(outbox(s), 1);
  e.reply(id, "reply-1", "I am interested"); await drain(e);
  e.approve(id, s.get(id).draft!.hash, "operator"); await drain(e);
  e.reply(id, "reply-2", "Please send booking calendar"); await drain(e);
  e.approve(id, s.get(id).draft!.hash, "operator"); await drain(e);
  assert.equal(s.get(id).status, "booking_pending"); assert.equal(outbox(s), 3);
  const event = { eventId: "booking-1", bookingId: "book-1", sequence: 1, startsAt: "2030-01-01T10:00:00Z", status: "confirmed" };
  e.booking(id, event); e.booking(id, event); assert.equal(s.get(id).status, "booked");
  e.booking(id, { ...event, eventId: "booking-2", sequence: 2, startsAt: "2030-01-02T10:00:00Z" });
  assert.equal(s.get(id).booking?.startsAt, "2030-01-02T10:00:00Z");
  assert.throws(() => e.booking(id, { ...event, eventId: "old-booking" }));
  e.booking(id, { ...event, eventId: "booking-3", sequence: 3, status: "cancelled" });
  assert.equal(s.get(id).status, "held"); assert.equal(s.events(id).filter(x => x.kind === "simulated_booking_event").length, 3); s.close();
});
test("automatic mode still reviews every outbound message", async () => {
  const { engine: e, store: s } = make(); const id = e.create(prospect(), "automatic").id; await drain(e);
  assert.equal(s.get(id).status, "waiting_reply"); assert.equal(outbox(s), 1);
  assert.equal(s.events(id).filter(x => x.kind === "compliance_review").length, 1); s.close();
});
test("permission and real addresses cannot be inferred or imported as synthetic", async () => {
  for (const permission of ["unknown", "denied"]) { const { engine: e, store: s } = make(); const r = e.create({ ...prospect(), permission }); await drain(e); assert.equal(s.get(r.id).status, "held"); assert.equal(outbox(s), 0); s.close(); }
  const { engine: e, store: s } = make(); assert.throws(() => e.create({ ...prospect(), email: "real@aspinvest.co.uk" })); assert.throws(() => e.create({ ...prospect(), phase2_outreach_ready: true })); s.close();
});
test("queued dispatch cancelled by immediate opt-out; duplicate events idempotent", async () => {
  const { engine: e, store: s } = make(); const id = e.create(prospect()).id; await drain(e);
  e.approve(id, s.get(id).draft!.hash, "operator"); e.reply(id, "stop-1", "Please stop emailing me"); e.reply(id, "stop-1", "Please stop emailing me"); await drain(e);
  assert.equal(s.get(id).status, "suppressed"); assert.equal(outbox(s), 0);
  assert.throws(() => e.reply(id, "stop-1", "Different body")); assert.throws(() => e.resume(id)); s.close();
});
test("reply cancels followups and duplicate replies do not cause duplicate messages", async () => {
  const { engine: e, store: s } = make(); const id = e.create(prospect(), "automatic").id; await drain(e); e.followup(id, 0);
  assert.equal(e.reply(id, "interested", "I am interested"), true);
  assert.equal(e.reply(id, "interested", "I am interested"), false);
  await drain(e);
  assert.equal(outbox(s), 2); assert.throws(() => e.followup(id, 0)); s.close();
});
test("complaint/advice stays escalated even if a subsequent reply is benign", async () => {
  const { engine: e, store: s } = make(); const id = e.create(prospect()).id;
  e.reply(id, "advice", "Should I invest in this?"); e.reply(id, "next", "I am interested"); await drain(e);
  assert.equal(s.get(id).status, "escalated"); assert.equal(outbox(s), 0); s.close();
});
test("editing invalidates exact version approval", async () => {
  const { engine: e, store: s } = make(); const id = e.create(prospect()).id; await drain(e);
  const old = s.get(id).draft!; e.approve(id, old.hash, "operator");
  e.edit(id, { subject: "Updated", body: old.body + " Thank you." });
  assert.throws(() => e.approve(id, old.hash, "operator")); await drain(e);
  assert.equal(outbox(s), 0); assert.equal(s.get(id).status, "awaiting_approval"); s.close();
});
test("regulatory sources missing, stale, unreviewed or changed prevent review", async () => {
  for (const failure of ["missing", "stale", "unreviewed", "changed"]) {
    const { engine: e, store: s } = make(); const source = s.sourceList()[0];
    if (failure === "missing") s.db.prepare("DELETE FROM sources WHERE id=?").run(source.id);
    else { if (failure === "stale") source.checkedAt = Date.now() - MAX_SOURCE_AGE - 1000; if (failure === "unreviewed") source.approvedBy = undefined; if (failure === "changed") source.changed = true; s.saveSource(source); }
    const id = e.create(prospect(), "automatic").id; await drain(e); assert.equal(s.get(id).status, "held", failure); assert.equal(outbox(s), 0); s.close();
  }
});
test("source change after approval prevents dispatch", async () => {
  const { engine: e, store: s } = make(); const id = e.create(prospect()).id; await drain(e); e.approve(id, s.get(id).draft!.hash, "operator");
  const source = s.sourceList()[0]; source.changed = true; s.saveSource(source); await drain(e); assert.equal(outbox(s), 0); assert.equal(s.get(id).status, "held"); s.close();
});
test("fabricated citations cannot pass", async () => {
  const { engine: e, store: s } = make(new OverrideModel((agent, _ctx, result) => agent === "compliance" ? { decision: "pass", summary: "Trust me", citations: [{ sourceId: "fca-promotions", hash: "invented", quote: "invented words that are not in any source" }] } : result));
  const id = e.create(prospect(), "automatic").id; await drain(e); assert.equal(s.get(id).status, "held"); assert.equal(outbox(s), 0); s.close();
});
test("hard wording checks override permissive model review", async () => {
  for (const body of ["ASP Private Capital offers guaranteed returns. Reply stop.", "ASP Private Capital: suitable for you. Reply stop.", "A company invites you to talk."]) {
    const { engine: e, store: s } = make(new OverrideModel((a, _c, result) => a === "outreach" ? { subject: "Offer", body } : result));
    const id = e.create(prospect(), "automatic").id; await drain(e); assert.equal(s.get(id).status, "held"); assert.equal(outbox(s), 0); s.close();
  }
});
test("revision loop capped at two corrections", async () => {
  const { engine: e, store: s } = make(new OverrideModel((a, _c, result) => a === "compliance" ? { ...(result as object), decision: "revise" } : result));
  const id = e.create(prospect(), "automatic").id; await drain(e); assert.equal(s.get(id).status, "escalated"); assert.equal(s.get(id).corrections, 2); assert.equal(outbox(s), 0); s.close();
});
test("global, campaign and agent pause stop execution", async () => {
  for (const scope of ["global", "campaign", "prospect"] as const) {
    const { engine: e, store: s } = make(); const id = e.create(prospect(), "automatic").id; e.pause(scope, true); assert.equal(await e.tick(), false); e.pause(scope, false); await drain(e); assert.equal(s.get(id).status, "waiting_reply"); s.close();
  }
});
test("opt-out arriving during inference invalidates the in-flight result", async () => {
  let id = "";
  const model = new OverrideModel((a, _c, result) => { if (a === "outreach") e.reply(id, "during-model", "unsubscribe"); return result; });
  const pair = make(model); const e = pair.engine; id = e.create(prospect(), "automatic").id; await drain(e);
  assert.equal(pair.store.get(id).status, "suppressed"); assert.equal(outbox(pair.store), 0); pair.store.close();
});
test("pause during inference discards completion until resumed", async () => {
  let once = false;
  const pair = make(new OverrideModel((a, _c, result) => { if (a === "outreach" && !once) { once = true; e.pause("global", true); } return result; }));
  const e = pair.engine; const id = e.create(prospect(), "automatic").id; await drain(e); assert.equal(outbox(pair.store), 0); e.pause("global", false); await drain(e); assert.equal(pair.store.get(id).status, "waiting_reply"); pair.store.close();
});
test("model errors retry with a bound and no fixture fallback", async () => {
  const { engine: e, store: s } = make(new OverrideModel(() => { throw new Error("secret-provider-detail"); })); const id = e.create(prospect()).id;
  for (let i = 0; i < 3; i++) { s.db.prepare("UPDATE jobs SET due=0").run(); await e.tick(); }
  assert.equal(s.get(id).status, "failed"); assert(!JSON.stringify(s.events(id)).includes("secret-provider-detail")); assert.equal(outbox(s), 0); s.close();
});
test("restart recovers expired job leases and preserves outbox dedupe", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "asp-outreach-test-")), filename = path.join(dir, "state.sqlite");
  let s = new OutreachStore(filename); seedFixtureSources(s); let e = new OutreachEngine(s, new FixtureModel()); const id = e.create(prospect(), "automatic").id;
  s.db.prepare("UPDATE jobs SET state='running',lease=0,owner='dead-worker'").run(); s.close();
  s = new OutreachStore(filename); e = new OutreachEngine(s, new FixtureModel()); await drain(e); assert.equal(s.get(id).status, "waiting_reply"); assert.equal(outbox(s), 1);
  const r = s.get(id); s.transaction(() => s.enqueue(r, "dispatch")); await drain(e); assert.equal(outbox(s), 1); s.close(); rmSync(dir, { recursive: true });
});
test("live mode rejects fixture law; model configuration is mandatory", async () => {
  const { store: s } = make(); assert.throws(() => usableSources(s, "live"));
  const previous = process.env.CTX_OUTREACH_MODEL_URL; delete process.env.CTX_OUTREACH_MODEL_URL;
  try { await assert.rejects(new ConfigurableModel().invoke("prospect", {}), /MODEL_UNAVAILABLE/); }
  finally { if (previous !== undefined) process.env.CTX_OUTREACH_MODEL_URL = previous; }
  s.close();
});
test("source import is allowlisted, version-bound and reviewed explicitly", () => {
  const s = new OutreachStore(":memory:"); const data = { id: "ico-email", title: "ICO email", jurisdiction: "UK", kind: "guidance", text: "A sufficiently long synthetic source document for import checks.", url: "https://ico.org.uk/example" };
  assert.throws(() => importSource(s, { ...data, url: "http://127.0.0.1/secrets" }));
  assert.throws(() => importSource(s, { ...data, url: "https://ico.org.uk/example?email=private" }));
  const first = importSource(s, data); approveSource(s, first.id, first.hash, "reviewer");
  const second = importSource(s, { ...data, text: data.text + " Changed." }); assert(second.changed); assert(!second.approvedBy); assert.throws(() => approveSource(s, second.id, first.hash, "reviewer"));
  assert.equal(s.db.prepare("SELECT count(*) n FROM source_versions").get()?.n, 2); s.close();
});
test("injected model tool requests are rejected by structured output validation", async () => {
  const { engine: e, store: s } = make(new OverrideModel(() => ({ tool: "send_email", recipient: "real@aspinvest.co.uk", override: true })));
  const id = e.create(prospect(), "automatic").id; for (let i = 0; i < 3; i++) { s.db.prepare("UPDATE jobs SET due=0").run(); await e.tick(); }
  assert.equal(s.get(id).status, "failed"); assert.equal(outbox(s), 0); s.close();
});

test("specific opportunities are never disclosed before consultation; only general macro information permitted", async () => {
  // Disclosing a specific opportunity or return is blocked deterministically
  const badDraft = "We have a specific opportunity in private debt with an 11% yield. Reply stop. ASP Private Capital.";
  const { engine: e1, store: s1 } = make(new OverrideModel((a, _c, res) => a === "outreach" ? { subject: "Exclusive Deal", body: badDraft } : res));
  const id1 = e1.create(prospect(), "automatic").id;
  await drain(e1);
  assert.equal(s1.get(id1).status, "held");
  assert.equal(s1.get(id1).promotionReview?.decision, "block");
  assert.equal(s1.get(id1).promotionReview?.specificOpportunitiesDisclosed, true);
  assert.ok(s1.get(id1).issue?.includes("Specific opportunities must never be disclosed prior to a consultation call"));
  assert.equal(outbox(s1), 0);
  s1.close();

  // General macroeconomic context in managed funds, private equity, precious metals passes
  const goodDraft = "The purpose of our outreach is to gather interest into ASP Private Capital as a private market liaison. Specific opportunities are never disclosed until an introductory consultation call. We observe macroeconomic shifts across managed funds, private equity, and precious metals. ASP Private Capital is not an adviser. Reply stop. ASP Private Capital.";
  const { engine: e2, store: s2 } = make(new OverrideModel((a, context, res) => a === "outreach" ? { subject: "Macro Perspectives", body: `${goodDraft} ${String(context.bookingUrl)}` } : res));
  const id2 = e2.create(prospect(), "automatic").id;
  await drain(e2);
  assert.equal(s2.get(id2).status, "waiting_reply", s2.get(id2).issue ?? "no issue recorded");
  assert.equal(s2.get(id2).promotionReview?.decision, "pass");
  assert.equal(s2.get(id2).promotionReview?.specificOpportunitiesDisclosed, false);
  assert.equal(s2.get(id2).draft?.body.includes("cal.com"), false);
  assert.equal(outbox(s2), 1);
  s2.close();
});



test("failed demo replay answers both questions, advances managed funds and repairs frustration", async () => {
  const {engine, store} = make();
  try {
    const id = engine.create(prospect(), "automatic").id;
    await drain(engine);
    const messages = [
      "Please provide some more information about who ASP is and how to initiate a conversation",
      "I am a sophisticated investor and am interested in managed funds. How do we get started then?",
      "I still don’t know where to begin. You have repeated yourself and are not clear with the next direction to go in.",
    ];
    for (const [i, text] of messages.entries()) {
      assert.equal(engine.reply(id, `replay-${i}`, text), true);
      await drain(engine);
      const run = store.get(id);
      assert.equal(run.status, "booking_pending", run.issue);
      const body = run.draft!.body;
      assert.match(body, /cal\.com\/.*user_id=/);
      assert.doesNotMatch(body, /please let me know|non-correlated|regulatory policy/i);
      if (i === 0) assert.match(body, /introducer and liaison/);
      if (i === 1) {
        assert.match(body, /interest in managed funds/);
        assert.doesNotMatch(body, /private equity|precious metals|not an adviser/);
      }
      if (i === 2) assert.match(body, /didn’t make the next step clear/);
      assert.equal(engine.reply(id, `replay-${i}`, text), false);
      assert.equal(run.booking?.status, undefined);
    }
    assert.equal(outbox(store), 4);
  } finally { store.close(); }
});

test("qualification claims and declined calls do not trigger booking; Thursday does", async () => {
  const model = new FixtureModel();
  for (const text of ["I am a sophisticated investor", "I do not want a call. How do we get started?", "Email only please"]) {
    const result = await model.invoke("conversation", {latestReply:text}) as {classification:string};
    assert.notEqual(result.classification, "booking");
    const reply = await model.invoke("outreach", {intent:"reply",latestReply:text,classification:result.classification,bookingUrl:"https://cal.com/test"}) as {body:string};
    assert.doesNotMatch(reply.body, /https:\/\/cal/);
  }
  const result = await model.invoke("conversation", {latestReply:"Let’s speak Thursday"}) as {classification:string};
  assert.equal(result.classification,"booking");
});

test("fee replies do not invent costs or compensation and fixtures avoid conflicted names", async () => {
  const result = await new FixtureModel().invoke("outreach", {intent:"reply",latestReply:"Can you send me your gold fees?",prospect:{name:"Marcus"},crmContext:{firstname:"Ziggy"}}) as {body:string};
  assert.match(result.body,/don’t have verified fee information/);
  assert.doesNotMatch(result.body,/at no cost|does not charge|Marcus|Ziggy/);
});

test("identical replies receive one revision then require review", async () => {
  const {engine,store} = make(new OverrideModel((agent, context, result) => agent === "outreach" && context.intent === "reply" ? {subject:"Re: Question",body:"ASP Private Capital acts as an introducer, not an adviser. Reply stop if you would prefer no further contact."} : result));
  try {
    const id=engine.create(prospect(),"automatic").id; await drain(engine);
    engine.reply(id,"first","What does ASP do?"); await drain(engine);
    assert.equal(store.get(id).status,"waiting_reply");
    engine.reply(id,"second","What does ASP do?"); await drain(engine);
    assert.equal(store.get(id).status,"escalated");
    assert.equal(store.get(id).corrections,1);
    assert.equal(outbox(store),2);
  } finally {store.close();}
});

test("provider readiness requires explicit model and does not send custom keys to Gemini", () => {
  assert.equal(outreachModelConfig({GEMINI_API_KEY:"test",CTX_OUTREACH_WRITER_MODEL:"fixture"}).configured,false);
  assert.equal(outreachModelConfig({GEMINI_API_KEY:"test",CTX_OUTREACH_WRITER_MODEL:"fixture"}).ready,false);
  assert.equal(outreachModelConfig({GEMINI_API_KEY:"test"}).ready,false);
  assert.equal(outreachModelConfig({GEMINI_API_KEY:"test",CTX_OUTREACH_WRITER_MODEL:"selected-model"}).ready,true);
  assert.equal(outreachModelConfig({CTX_OUTREACH_MODEL_KEY:"test",CTX_OUTREACH_WRITER_MODEL:"selected-model"}).endpoint,undefined);
});

test("live adapter uses writer temperature and never falls back after provider failure", async () => {
  const names=["GEMINI_API_KEY","CTX_OUTREACH_MODEL_KEY","CTX_OUTREACH_MODEL_URL","CTX_OUTREACH_WRITER_MODEL"] as const;
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  const temperatures:number[]=[];
  try {
    delete process.env.CTX_OUTREACH_MODEL_KEY; delete process.env.CTX_OUTREACH_MODEL_URL;
    process.env.GEMINI_API_KEY="synthetic-key"; process.env.CTX_OUTREACH_WRITER_MODEL="selected-model";
    globalThis.fetch=async (_input, init) => {
      temperatures.push((JSON.parse(String(init?.body)) as {temperature:number}).temperature);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({subject:"Reply",body:"Specific answer"})}}]}));
    };
    await new ConfigurableModel().invoke("outreach",{});
    assert.deepEqual(temperatures,[0.4]);
    globalThis.fetch=async()=>new Response("unavailable",{status:503});
    await assert.rejects(new ConfigurableModel().invoke("outreach",{}),/MODEL_UNAVAILABLE/);
  } finally {
    globalThis.fetch=originalFetch;
    for(const name of names) {if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
  }
});


test("booking-pending reply retries failed SMTP once accepted, without duplicate delivery", async () => {
  const previousEmail=process.env.HUBSPOT_TEST_CONTACT_EMAIL;
  const previousId=process.env.HUBSPOT_TEST_CONTACT_ID;
  const {engine,store}=make();
  try {
    process.env.HUBSPOT_TEST_CONTACT_EMAIL="alex@example.test";
    process.env.HUBSPOT_TEST_CONTACT_ID="synthetic-1";
    const id=engine.create(prospect(),"automatic").id; await drain(engine);
    engine.reply(id,"book-request","Let’s speak Thursday"); await drain(engine);
    const run=store.get(id); run.sandbox=true; store.save(run);
    assert.equal(store.get(id).status,"booking_pending");
    let calls=0;
    const send: typeof import("../src/lib/server/outreach/transport/email").sendLiveOutreachEmail=async message=>{
      calls++; assert.match(message.text,/cal\.com\/.*user_id=/);
      return calls===1 ? {sent:false,error:"temporary test failure"} : {sent:true,messageId:"synthetic-reply-delivered"};
    };
    await deliverControlledDemoReply(store,engine,false,send);
    await deliverControlledDemoReply(store,engine,false,send);
    await deliverControlledDemoReply(store,engine,false,send);
    assert.equal(calls,2);
    assert.equal(store.get(id).transcript.at(-1)?.deliveryStatus,"sent");
    assert.equal(store.get(id).status,"booking_pending");
    assert.equal(store.get(id).booking,undefined);
  } finally {
    store.close();
    if(previousEmail===undefined)delete process.env.HUBSPOT_TEST_CONTACT_EMAIL;else process.env.HUBSPOT_TEST_CONTACT_EMAIL=previousEmail;
    if(previousId===undefined)delete process.env.HUBSPOT_TEST_CONTACT_ID;else process.env.HUBSPOT_TEST_CONTACT_ID=previousId;
  }
});
