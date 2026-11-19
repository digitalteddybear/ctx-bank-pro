import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createOperatorSession} from '../src/lib/server/operator-session.ts';
import {adminEmail} from '../src/lib/server/ctx-profile-store.ts';
import {DEFAULT_NOTIFICATION_PREFERENCES} from '../src/lib/notification-contract.ts';
const base=process.env.QA_BASE_URL??'http://localhost:3000';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.context().addCookies([{name:'ctx-operator',value:await createOperatorSession(adminEmail()),url:base,httpOnly:true}]);
 await page.addInitScript(()=>{
   window.__ctxNotices=[];
   window.Notification=class {
     static permission='granted';
     static async requestPermission(){return 'granted';}
     constructor(title){window.__ctxNotices.push(title);}
     close(){}
   };
 });
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let approved=false;
 let snapshot={preferences:{...DEFAULT_NOTIFICATION_PREFERENCES,quietHours:'custom'},revision:1,updatedAt:Date.now(),items:[{id:'event:1',kind:'reply',title:'Prospect reply received',at:Date.now(),read:false}],emailReady:true,emailRecipient:'operator@example.org',deliveryIssues:0};
 const source={id:'test-policy',title:'Test policy',text:'The exact source version selected for operator review.',url:'https://www.aspinvest.co.uk/privacy-policy',hash:'version-1',fixture:false,changed:true};
 await page.route('**/api/notifications',async route=>{
   if(route.request().method()==='PUT'){
     const input=route.request().postDataJSON();
     if(input.read)snapshot.items[0].read=true;
     else snapshot={...snapshot,preferences:input.preferences,revision:snapshot.revision+1};
   }
   await route.fulfill({status:200,json:snapshot});
 });
 await page.route('**/api/agents/sources',route=>route.fulfill({status:200,json:[{...source,...(approved?{changed:false,approvedBy:'operator'}:{})}]}));
 await page.route('**/api/agents',async route=>{
   const body=route.request().postDataJSON();
   assert.equal(body.action,'approve-source');assert.equal(body.hash,'version-1');assert.equal(body.id,source.id);
   approved=true;await route.fulfill({status:200,json:{ok:true}});
 });
 await page.goto(base+'/?view=ai-settings&section=Notifications',{waitUntil:'domcontentloaded'});
 await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
 await page.getByRole('textbox',{name:'Start',exact:true}).fill('21:30');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.astryx-toast').filter({hasText:'Notifications saved.'}).waitFor();
 assert.equal(snapshot.preferences.quietStart,'21:30');
 await page.getByRole('button',{name:'Review',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Review source'});
 await dialog.waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Source text',exact:true}).inputValue(),source.text);
 await page.getByRole('button',{name:'Approve',exact:true}).click();
 await page.locator('.astryx-toast').filter({hasText:'Source approved.'}).waitFor();
 assert.ok(approved);
 await page.getByRole('button',{name:'Mark read',exact:true}).click();
 await page.getByText('Read',{exact:true}).waitFor();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(input=>input.value==='21:30'));
 snapshot.preferences.desktop=true; snapshot.preferences.quietHours="off";
 snapshot.items.push({id:'event:2',kind:'reply',title:'Second reply',at:Date.now(),read:false});
 await page.evaluate(()=>window.dispatchEvent(new Event('ctx:backend-updated')));
 await page.waitForFunction(()=>window.__ctxNotices.length===1,null,{timeout:15000});
 await page.evaluate(()=>window.dispatchEvent(new Event('ctx:backend-updated')));
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.__ctxNotices.length),1);
 approved=false;
 await page.setViewportSize({width:390,height:844});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
 await page.getByRole('button',{name:'Review',exact:true}).click();
 const mobile=await page.getByRole('dialog',{name:'Review source'}).evaluate(dialog=>({width:dialog.clientWidth,scroll:dialog.scrollWidth}));
 assert.ok(mobile.scroll<=mobile.width+1,'Source review must fit mobile width');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({sourceTextVisible:true,exactVersionApproved:true,notificationSaved:true,readPersisted:true,quietHoursRestored:true,pageErrors:0,externalMutations:0,desktopNotice:true,duplicateNoticePrevented:true,mobileReview:true}));
 await page.close();
}finally{await browser.close();}
