import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base=process.env.QA_BASE_URL??"http://127.0.0.1:3100";
const password=(await readFile("deploy/secrets/initial-admin-password","utf8")).trim();
let ready=false;
for(let attempt=0;attempt<20;attempt++){
  try{ready=(await fetch(base+"/api/ready")).status===200;}catch{}
  if(ready)break;
  await new Promise(resolve=>setTimeout(resolve,500));
}
assert.ok(ready,"Web container did not become ready.");
assert.equal((await fetch(base+"/api/agents")).status,401);
const login=await fetch(base+"/api/session",{method:"POST",headers:{"content-type":"application/json",origin:base,"sec-fetch-site":"same-origin"},body:JSON.stringify({email:"operator@example.test",password})});
assert.equal(login.status,200,"Administrator sign-in must work.");
const cookie=login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
assert.match(login.headers.get("set-cookie"),/httponly/i);
async function api(path,body){
  const response=await fetch(base+path,{method:body?"POST":"GET",headers:{cookie,origin:base,"sec-fetch-site":"same-origin","content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  assert.ok(response.ok,"API request failed: "+path+" "+JSON.stringify(data));
  return data;
}
const template='<html><body><table><tr><td>ASP<br>{{message}}</td></tr></table><!--'+"x".repeat(18000)+'--></body></html>';
if(process.env.QA_EXPECT_PERSISTED==="1")assert.equal((await api("/api/agents/campaign?templateScope=demo")).template,template,"Template must survive restart.");
await api("/api/agents/campaign",{action:"save-reply-template",scope:"demo",template});
assert.equal((await api("/api/agents/campaign?templateScope=demo")).template,template);
const preview=await api("/api/agents/campaign",{action:"preview-reply-template",template});
assert.ok(preview.html.includes("introductory conversation"));
assert.ok(!preview.html.includes("{{message}}"));
await api("/api/agents/campaign",{action:"save-preferences",preferences:{openingMessage:"Hello {{First name}}",standardFooter:"ASP",replyHtmlTemplate:"<p>{{message}}</p>",replyObjectives:["answer-questions"],replyRules:[]}});
assert.equal((await api("/api/agents/campaign?templateScope=demo")).template,template,"Campaign saving must not overwrite Demo.");
const operations=await api("/api/agents/operations");
assert.ok(Date.now()-operations.heartbeat<120000,"Independent worker heartbeat is stale.");
assert.equal((await api("/api/agents")).externalDeliveryDisabled,true);
console.log(JSON.stringify({web:true,administrator:true,largeTemplateSave:true,sharedRenderer:true,scopeIsolation:true,independentWorker:true,liveActionsDisabled:true}));
