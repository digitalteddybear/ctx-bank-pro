import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createOperatorSession} from '../src/lib/server/operator-session.ts';
import {adminEmail} from '../src/lib/server/ctx-profile-store.ts';
const base=process.env.QA_BASE_URL??'http://localhost:3000';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 for(const mode of ['Campaign','Live Demo']){
   const page=await browser.newPage({viewport:{width:1440,height:1000}});
   await page.context().addCookies([{name:'ctx-operator',value:await createOperatorSession(adminEmail()),url:base,httpOnly:true}]);
   const activity=[];
   page.on('request',r=>{if(r.url().endsWith('/api/agents/campaign')&&r.method()==='POST')activity.push({event:'request',action:r.postDataJSON()?.action,at:Date.now()});});
   page.on('requestfailed',r=>activity.push({event:'failed',url:new URL(r.url()).pathname,error:r.failure()?.errorText}));
   page.on('response',r=>{if(r.url().endsWith('/api/agents/campaign')&&r.request().method()==='POST')activity.push({event:'response',status:r.status(),at:Date.now()});});
   try{
     await page.goto(base+'/?view=agents',{waitUntil:'domcontentloaded'});
     await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
     await page.getByRole('button',{name:mode,exact:true}).click();
     if(mode==='Campaign')await page.getByRole('button',{name:/3\. Message/}).click();
     const title=(mode==='Campaign'?'Campaign':'Demo')+' reply email preview';
     for(let i=0;i<6;i++){
       const expanded=i>=3;
       if(i===3)await page.getByRole('button',{name:'Expand preview',exact:true}).click();
       const label=expanded?'HTML template':'Reply HTML template';
       const expected='Preview check '+mode+' '+i;
       await page.getByRole('textbox',{name:label,exact:true}).fill('<h1>'+expected+'</h1><p>{{message}}</p>');
       await page.waitForFunction(({title,expected})=>document.querySelector('iframe[title="'+title+'"]')?.srcdoc.includes(expected),{title,expected},{timeout:15000,polling:100});
     }
     assert.equal(activity.filter(item=>item.event==='response'&&item.status!==200).length,0);
     console.log(JSON.stringify({mode,edits:6,realPreviewRequests:true,saves:0}));
   }catch(error){console.log(JSON.stringify({mode,activity,values:await page.getByRole('textbox',{name:/HTML template/}).evaluateAll(inputs=>inputs.map(input=>({value:input.value,connected:input.isConnected}))),dialogs:await page.locator('dialog').evaluateAll(items=>items.map(item=>({open:item.open,label:item.getAttribute('aria-label')})))}));throw error;}
   finally{await page.close();}
 }
}finally{await browser.close();}
