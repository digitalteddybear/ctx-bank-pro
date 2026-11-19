import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {NextRequest} from "next/server";
import {GET,PUT} from "../src/app/api/ai-workspace/settings/route";
import {DEFAULT_AI_SETTINGS} from "../src/lib/ai-settings";
import {outreachStore} from "../src/lib/server/outreach/store-instance";
import {OutreachStore} from "../src/lib/server/outreach/store";
import {readAISettings} from "../src/lib/server/ai-settings-store";
test("AI settings persist, reject stale saves and never activate outreach",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"ctx-ai-settings-"));
 process.env.CTX_OUTREACH_DB_PATH=join(directory,"workflows.sqlite");
 process.env.CTX_OUTREACH_OPERATOR_TOKEN="a".repeat(64);
 delete process.env.CTX_OUTREACH_OPERATOR_TOKEN_FILE;
 const url="http://localhost/api/ai-workspace/settings";
 const headers={authorization:"Bearer "+process.env.CTX_OUTREACH_OPERATOR_TOKEN,origin:"http://localhost","content-type":"application/json"};
 const put=(body:unknown,override:Record<string,string>=headers)=>PUT(new NextRequest(url,{method:"PUT",headers:override,body:JSON.stringify(body)}));
 try {
   assert.equal((await GET(new NextRequest(url,{headers}))).status,200);
   assert.equal((await GET(new NextRequest(url))).status,401);
   const settings={...DEFAULT_AI_SETTINGS,persona:"Code Auditor",sampling:{temperature:0.4,topP:0.8,frequencyPenalty:0.1}};
   const result=await put({settings,revision:0});assert.equal(result.status,200);assert.equal((await result.json()).revision,1);
   assert.equal((await put({settings:DEFAULT_AI_SETTINGS,revision:0})).status,409);
   assert.equal((await put({settings,revision:1},{...headers,origin:"https://other.example"})).status,403);
   assert.equal((await put({settings:{...settings,sampling:{temperature:9,topP:1,frequencyPenalty:0}},revision:1})).status,400);
   const reopened=new OutreachStore(process.env.CTX_OUTREACH_DB_PATH);
   try{
     assert.deepEqual(readAISettings(reopened).settings,settings);
     assert.equal(readAISettings(reopened).revision,1);
     assert.equal(reopened.setting("lead-outreach-settings"),undefined);
     assert.equal(reopened.list().length,0);
   }finally{reopened.db.close();}
 }finally{outreachStore().db.close();rmSync(directory,{recursive:true,force:true});}
});
