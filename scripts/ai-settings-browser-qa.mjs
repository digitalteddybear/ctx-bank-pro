import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createOperatorSession} from '../src/lib/server/operator-session.ts';
import {adminEmail} from '../src/lib/server/ctx-profile-store.ts';
import {DEFAULT_AI_SETTINGS} from '../src/lib/ai-settings.ts';

const base=process.env.QA_BASE_URL??'http://localhost:3000';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.context().addCookies([{name:'ctx-operator',value:await createOperatorSession(adminEmail()),url:base,httpOnly:true}]);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let saved={settings:structuredClone(DEFAULT_AI_SETTINGS),revision:1,updatedAt:new Date().toISOString()};
 let reject=false;
 // Mock only settings persistence; no operator configuration is changed.
 await page.route('**/api/ai-workspace/settings',async route=>{
   if(route.request().method()==='PUT'){
     if(reject){await route.fulfill({status:409,json:{error:'Settings changed in another session. Reload before saving.'}});return;}
     const input=route.request().postDataJSON();
     saved={settings:input.settings,revision:saved.revision+1,updatedAt:new Date().toISOString()};
   }
   await route.fulfill({status:200,json:saved});
 });
 await page.goto(base+'/?view=ai-settings',{waitUntil:'domcontentloaded'});
 await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
 const model=page.getByRole('textbox',{name:'General Chat model ID',exact:true});
 await model.waitFor();
 await model.fill('saved-model-check');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.astryx-toast').filter({hasText:'AI settings saved.'}).waitFor();
 assert.equal(saved.settings.models.generalChat.model,'saved-model-check');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(input=>input.value==='saved-model-check'),null,{timeout:15000});
 reject=true;
 await model.fill('must-not-overwrite');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.astryx-toast').filter({hasText:'Settings changed in another session.'}).waitFor();
 assert.equal(saved.settings.models.generalChat.model,'saved-model-check');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({saveFeedback:true,reloadRestoresModel:true,conflictVisible:true,pageErrors:0,realSettingsUnchanged:true}));
 await page.close();
}finally{await browser.close();}
