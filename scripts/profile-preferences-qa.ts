import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes} from "node:crypto";
import {execFileSync} from "node:child_process";
import {NextRequest} from "next/server";
import {GET,PATCH} from "../src/app/api/session/route";
import {createGuestSession,createOperatorSession,sessionCookie} from "../src/lib/server/operator-session";
import {saveProviderKey,saveRuntimeSender} from "../src/lib/server/outreach/runtime-settings";
import {outreachStore} from "../src/lib/server/outreach/store-instance";

test("profile preferences and encrypted sender and integration configuration survive app exit",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"ctx-prefs-"));
  process.env.CTX_CONFIG_DIR=directory;
  process.env.CTX_OUTREACH_DB_PATH=join(directory,"workflows.sqlite");
  process.env.CTX_SETTINGS_KEY_FILE=join(directory,"key");
  writeFileSync(process.env.CTX_SETTINGS_KEY_FILE,randomBytes(32).toString("hex"),{mode:0o600});
  process.env.CTX_ADMIN_EMAIL="operator@example.test";process.env.CTX_SESSION_SECRET="T".repeat(48);
  const url="http://localhost/api/session";
  const cookie=(token:string)=>sessionCookie+"="+token;
  const admin=cookie(await createOperatorSession("operator@example.test")),guest=cookie(await createGuestSession());
  const patch=(cookie:string,value:string,origin="http://localhost")=>PATCH(new NextRequest(url,{method:"PATCH",headers:{cookie,origin},body:JSON.stringify({themePreference:value})}));
  try{
    assert.equal((await patch(guest,"light")).status,403);
    assert.equal((await patch(admin,"light","https://elsewhere.example")).status,403);
    assert.equal((await patch(admin,"invalid")).status,400);
    assert.equal((await patch(admin,"light")).status,200);
    assert.equal((await (await GET(new NextRequest(url,{headers:{cookie:admin}}))).json()).themePreference,"light");
    assert.equal((await (await GET(new NextRequest(url,{headers:{cookie:guest}}))).json()).themePreference,undefined);
    saveRuntimeSender({GMAIL_USER:"sender@example.test",GMAIL_APP_PASSWORD:"synthetic-pass",CTX_SENDER_NAME:"Dylan",CTX_LIVE_EMAIL_DISPATCH:"false"});
    saveProviderKey("hubspot","synthetic-crm");
    saveProviderKey("openai-compatible","synthetic-model");
    const store=outreachStore();
    store.setSetting("integration-settings",JSON.stringify({hubspotWrites:false,calEventTypeId:"123"}));
    assert.ok(!String(store.setting("encrypted-sender")).includes("synthetic-pass"));
    const env={...process.env};
    for(const name of ["GMAIL_APP_PASSWORD","GMAIL_USER","CTX_SENDER_NAME","CTX_LIVE_EMAIL_DISPATCH","HUBSPOT_ACCESS_TOKEN","OPENAI_COMPATIBLE_API_KEY","CAL_EVENT_TYPE_ID","HUBSPOT_WRITES_ENABLED"])delete env[name];
    execFileSync(process.execPath,["--import","tsx","--input-type=module","-e",`
      import assert from 'node:assert/strict';
      import {outreachStore} from './src/lib/server/outreach/store-instance.ts';
      import {loadRuntimeSender,loadProviderKeys,loadIntegrationSettings} from './src/lib/server/outreach/runtime-settings.ts';
      loadRuntimeSender();loadProviderKeys();loadIntegrationSettings();
      assert.equal(outreachStore().setting('administrator-theme'),'light');
      assert.equal(process.env.GMAIL_APP_PASSWORD,'synthetic-pass');
      assert.equal(process.env.GMAIL_USER,'sender@example.test');
      assert.equal(process.env.HUBSPOT_ACCESS_TOKEN,'synthetic-crm');
      assert.equal(process.env.OPENAI_COMPATIBLE_API_KEY,'synthetic-model');
      assert.equal(process.env.CTX_LIVE_EMAIL_DISPATCH,'false');
      assert.equal(process.env.HUBSPOT_WRITES_ENABLED,'false');
      assert.equal(process.env.CAL_EVENT_TYPE_ID,'123');
      outreachStore().close();
    `],{env});
  }finally{outreachStore().close();rmSync(directory,{recursive:true,force:true});}
});
