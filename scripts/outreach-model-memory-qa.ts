import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DEFAULT_AI_SETTINGS} from "../src/lib/ai-settings";
import {OutreachStore} from "../src/lib/server/outreach/store";
import {outreachStore} from "../src/lib/server/outreach/store-instance";
import {ConfigurableModel} from "../src/lib/server/outreach/models";
import {OutreachEngine} from "../src/lib/server/outreach/engine";
import {NextRequest} from "next/server";
import {POST as configure} from "../src/app/api/agents/model-settings/route";

test("configured campaign model receives delivered history for the same contact after restart",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"ctx-model-memory-"));
  const filename=join(directory,"workflows.sqlite");
  process.env.CTX_OUTREACH_DB_PATH=filename;
  process.env.CTX_OUTREACH_OPERATOR_TOKEN="x".repeat(40);
  process.env.CTX_WORKER_MODE="external";
  process.env.OLLAMA_BASE_URL="http://localhost:11434/v1";
  const seed=new OutreachStore(filename);
  const prior=new OutreachEngine(seed,new ConfigurableModel()).createCampaignProspect({
    id:"lead-123",email:"contact@example.test",name:"Alex",permission:"granted",facts:[],dossier:"Synthetic contact history used for isolated integration testing.",phase1LeadId:"lead-123",phase1Validated:true
  },"human","first");
  seed.cancel(prior.id);
  prior.status="booked";
  prior.transcript=[{direction:"inbound",eventId:"one",text:"Please call me Alex."},
    {direction:"outbound",eventId:"two",text:"Thank you, Alex.",deliveryStatus:"sent"},
    {direction:"outbound",eventId:"three",text:"UNSENT",deliveryStatus:"queued"}];
  seed.save(prior);
  for(const [id,overrides] of Object.entries({
    sandbox:{sandbox:true},demo:{campaignId:undefined},synthetic:{synthetic:true},
    wrongEmail:{prospect:{...prior.prospect,email:"someone@example.test"}},
    wrongId:{prospect:{...prior.prospect,id:"lead-456",phase1LeadId:"lead-456"}}
  }))seed.save({...prior,...overrides,id,transcript:[{direction:"inbound",eventId:id,text:"UNRELATED"}]});
  seed.close();
  const store=outreachStore(), originalFetch=globalThis.fetch;
  const systems:string[]=[];
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),"http://localhost:11434/v1/chat/completions");
    const body=JSON.parse(String(init?.body));
    const system=String(body.messages[0].content);
    systems.push(system);
    assert.equal(body.model,"isolated-test-model");
    let answer;
    if(system.includes("connection check"))answer={ready:true};
    else{
      const context=JSON.parse(body.messages[1].content);
      assert.equal(context.prospect.name,"Alex");
      assert.equal(context.latestReply,"What about managed funds?");
      assert.deepEqual(context.contactHistory.map((r:{runId:string})=>r.runId),[prior.id]);
      assert.deepEqual(context.contactHistory[0].messages.map((m:{text:string})=>m.text),["Please call me Alex.","Thank you, Alex."]);
      assert.equal(context.transcript.at(-1).role,"prospect");
      answer=system.includes("ASP conversation agent")?{classification:"question",summary:"Asked about managed funds."}:{subject:"Managed funds",body:"Hello Alex, which aspect of managed funds would you like to discuss?"};
    }
    return Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});
  };
  try{
    const settings=structuredClone(DEFAULT_AI_SETTINGS);
    settings.models.leadOutreach={provider:"ollama",model:"isolated-test-model"};
    const response=await configure(new NextRequest("http://localhost/api/agents/model-settings",{method:"POST",headers:{authorization:"Bearer "+process.env.CTX_OUTREACH_OPERATOR_TOKEN,"content-type":"application/json"},body:JSON.stringify(settings)}));
    assert.equal(response.status,200);
    const engine=new OutreachEngine(store,new ConfigurableModel());
    const current=engine.createCampaignProspect(prior.prospect,"human","next");
    current.transcript=[{direction:"outbound",text:"Hello Alex.",eventId:"opening",deliveryStatus:"sent"}];
    store.save(current);
    engine.reply(current.id,"reply","What about managed funds?");
    await engine.tick();
    assert.equal(store.get(current.id).classification,"question");
    await engine.tick();
    assert.match(store.get(current.id).draft?.body??"",/Hello Alex/);
    assert.equal(systems.length,3);
  }finally{globalThis.fetch=originalFetch;store.close();rmSync(directory,{recursive:true,force:true});}
});
