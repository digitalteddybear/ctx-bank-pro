import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createOperatorSession} from '../src/lib/server/operator-session.ts';
import {adminEmail} from '../src/lib/server/ctx-profile-store.ts';
const base=process.env.QA_BASE_URL??'http://localhost:3000';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.context().addCookies([{name:'ctx-operator',value:await createOperatorSession(adminEmail()),url:base,httpOnly:true}]);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let saved,overview;
 page.on('response',async response=>{
   if(response.url().includes('/api/agents/campaign?segment=') && response.ok() && !overview){
     try{overview=await response.json();}catch{/* navigation may cancel an older request */}
   }
 });
 await page.route('**/api/agents/campaign**',async route=>{
   const request=route.request();
   if(request.method()==='POST'&&request.postDataJSON().action==='save-preferences'){
     saved=request.postDataJSON().preferences;
     await route.fulfill({status:200,json:{preferences:{...saved,updatedAt:new Date().toISOString()}}});return;
   }
   if(request.method()==='GET' && saved && overview){
     await route.fulfill({status:200,json:{...overview,preferences:{...saved,updatedAt:new Date().toISOString()}}});return;
   }
   await route.continue();
 });
 const open=async()=>{
   await page.goto(base+'/?view=agents',{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
   await page.getByRole('button',{name:'Campaign',exact:true}).click();
   await page.getByRole('button',{name:/2\. Cohort/}).click();
 };
 await open();
 await page.waitForFunction(()=>document.querySelectorAll('button').length>0);
 const deadline=Date.now()+90000;
 while(!overview && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
 assert.ok(overview,'Authenticated campaign overview loaded');
 await page.getByLabel('Daily openings',{exact:true}).fill('25');
 await page.getByLabel('Daily total',{exact:true}).fill('100');
 await page.getByRole('button',{name:'Save',exact:true}).last().click();
 await page.locator('.astryx-toast').filter({hasText:'Campaign preferences saved.'}).waitFor();
 assert.deepEqual(saved.deliveryLimits,{dailyStarts:25,dailyTotal:100});
 await open();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(input=>input.value==='100'));
 for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   for(const label of ['Daily openings','Daily total']){
     const input=page.getByLabel(label,{exact:true});await input.scrollIntoViewIfNeeded();
     const bounds=await input.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width,`${label} overflows at ${width}`);
   }
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({save:true,reload:true,desktop:true,mobile:true,pageErrors:0,realPreferencesUnchanged:true}));
 await page.close();
}finally{await browser.close();}
