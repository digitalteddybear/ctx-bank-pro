import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import {GET,POST} from "../src/app/api/agents/[[...segments]]/route";
import {outreachEngine,outreachStore} from "../src/lib/server/outreach/runtime";

test("inbox template reads and reply edits are isolated, atomic and replay-safe",async()=>{
  process.env.CTX_OUTREACH_DB_PATH=":memory:";
  process.env.CTX_WORKER_MODE="external";
  process.env.CTX_OUTREACH_OPERATOR_TOKEN="T".repeat(48);
  delete process.env.CTX_OUTREACH_OPERATOR_TOKEN_FILE;
  const store=outreachStore();
  try{
    const engine=outreachEngine("fixture");
    const run=engine.create({id:"one",name:"One",email:"one@example.test",permission:"granted",facts:[]});
    const other=engine.create({id:"two",name:"Two",email:"two@example.test",permission:"granted",facts:[]});
    const a="<main>{{message}}</main>",b="<p>{{message}}</p>";
    store.setSetting("reply-html-template:"+run.id,a);
    store.setSetting("reply-html-template:"+other.id,b);
    const url="http://localhost/api/agents";
    const headers={authorization:"Bearer "+process.env.CTX_OUTREACH_OPERATOR_TOKEN,"content-type":"application/json"};
    const read=async(id:string)=>(await GET(new NextRequest(url,{headers}),{params:Promise.resolve({segments:["runs",id,"reply-template"]})})).json();
    const reply=(eventId:string,extra:Record<string,string>={})=>POST(new NextRequest(url,{method:"POST",headers,body:JSON.stringify({action:"reply",id:run.id,eventId,text:"Thank you",...extra})}),{params:Promise.resolve({})});
    assert.deepEqual(await read(run.id),{template:a});
    assert.equal((await reply("unmodified")).status,200);
    assert.deepEqual(await read(run.id),{template:a});
    assert.equal((await reply("edited",{htmlTemplate:b,baseTemplate:a})).status,200);
    assert.deepEqual(await read(run.id),{template:b});
    assert.equal((await reply("stale",{htmlTemplate:a,baseTemplate:a})).status,409);
    assert.equal((await reply("invalid",{htmlTemplate:"no placeholder",baseTemplate:b})).status,400);
    assert.equal((await reply("edited",{htmlTemplate:a})).status,200);
    assert.equal(store.get(run.id).transcript.length,2);
    assert.deepEqual(await read(run.id),{template:b});
    assert.equal((await reply("second-edit",{htmlTemplate:a,baseTemplate:b})).status,200);
    assert.deepEqual(await read(other.id),{template:b});
  }finally{store.close();}
});
