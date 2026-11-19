import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createOperatorSession} from '../src/lib/server/operator-session.ts';
import {adminEmail} from '../src/lib/server/ctx-profile-store.ts';

// Save transport is intercepted: exercise feedback without overwriting operator templates.
// campaign-preview-qa.ts separately verifies the real routes and durable SQLite storage.
const base=process.env.QA_BASE_URL??'http://localhost:3000';
const browser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
let page;
const previews=[];
try {
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.context().addCookies([{name:'ctx-operator',value:await createOperatorSession(adminEmail()),url:base,httpOnly:true}]);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',async response=>{if(response.url().endsWith('/api/agents/campaign')&&response.request().method()==='POST')previews.push({status:response.status(),action:response.request().postDataJSON()?.action,body:(await response.text()).slice(0,250)});});
  let rejectSave=false;
  let savedDemo=null;
  const saveHandler=async route=>{
    const request=route.request();
    if(request.method()==='POST'){
      const body=request.postDataJSON();
      if(['save-preferences','save-demo-preferences'].includes(body.action)){
        if(!rejectSave&&body.action==='save-demo-preferences')savedDemo=body.preferences;
        await route.fulfill({status:rejectSave?500:200,contentType:'application/json',body:JSON.stringify(rejectSave?{error:'Test save failure'}:body.action==='save-preferences'?{preferences:{...body.preferences,updatedAt:new Date().toISOString()}}:{saved:true,preferences:body.preferences,template:body.preferences.replyHtmlTemplate,templateVersion:1,updatedAt:new Date().toISOString()})});return;
      }
    }
    await route.continue();
  };
  await page.goto(base+'/?view=agents',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
  for(const mode of ['Campaign','Live Demo']){
    await page.getByRole('button',{name:mode,exact:true}).click();
    if(mode==='Campaign')await page.getByRole('button',{name:/3\. Message/}).click();
    else await page.getByRole('textbox',{name:'Subject Line',exact:true}).fill('Persistence check subject');
    const title=(mode==='Campaign'?'Campaign':'Demo')+' reply email preview';
    await page.getByRole('textbox',{name:'Reply HTML template',exact:true}).fill('<h1>Design '+mode+'</h1><p>{{message}}</p>');
    await page.waitForFunction(({title,expected})=>document.querySelector('iframe[title="'+title+'"]')?.srcdoc.includes(expected),{title,expected:'Design '+mode},{timeout:30000,polling:100});
    await page.getByRole('button',{name:'Expand preview',exact:true}).click();
    await page.getByRole('textbox',{name:'HTML template',exact:true}).fill('<h1>Expanded '+mode+'</h1><p>{{message}}</p>');
    await page.waitForFunction(expected=>Array.from(document.querySelectorAll('iframe')).some(frame=>frame.title.startsWith('Expanded')&&frame.srcdoc.includes(expected)),'Expanded '+mode,{timeout:30000,polling:100});
    await page.keyboard.press('Escape');
    await page.route('**/api/agents/campaign',saveHandler);
    await page.getByRole('button',{name:'Save',exact:true}).first().click();
    await page.locator('.astryx-toast').filter({hasText:mode==='Campaign'?'Campaign preferences saved.':'Demo settings saved.'}).waitFor({timeout:15000});
    rejectSave=true;
    await page.getByRole('button',{name:'Save',exact:true}).first().click();
    await page.locator('.astryx-toast').filter({hasText:'Test save failure'}).waitFor({timeout:15000});
    rejectSave=false;
    await page.unroute('**/api/agents/campaign',saveHandler);
    await page.keyboard.press('Escape');
    console.log(JSON.stringify({mode,inlinePreview:true,expandedPreview:true,escapePreservesParent:true,successToast:true,failureToast:true}));
  }
  assert.ok(savedDemo);
  assert.equal(savedDemo.customSubject,'Persistence check subject');
  await page.route('**/api/agents/campaign?preferencesScope=demo',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({preferences:savedDemo,template:savedDemo.replyHtmlTemplate,templateVersion:1,updatedAt:new Date().toISOString()})}));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.boot-sequence').waitFor({state:'hidden',timeout:90000});
  await page.getByRole('button',{name:'Live Demo',exact:true}).click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(input=>input.value==='Persistence check subject'),null,{timeout:15000,polling:100});
  assert.equal(await page.getByRole('textbox',{name:'Prospect Email',exact:true}).inputValue(),savedDemo.prospectEmail);
  assert.equal(await page.getByRole('textbox',{name:'Opening Message Body',exact:true}).inputValue(),savedDemo.customBody);
  assert.equal(await page.getByRole('textbox',{name:'Reply HTML template',exact:true}).inputValue(),savedDemo.replyHtmlTemplate);
  await page.keyboard.press('Escape');
  console.log(JSON.stringify({demoReloadRestoresSettings:true}));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Campaign',exact:true}).click();
  await page.getByRole('button',{name:/3\. Message/}).click();
  await page.getByRole('button',{name:'Expand preview',exact:true}).click();
  const dimensions=await page.locator('dialog[open]').last().evaluate(dialog=>({width:dialog.clientWidth,scrollWidth:dialog.scrollWidth}));
  assert.ok(dimensions.scrollWidth<=dimensions.width+1,'Mobile preview must not overflow horizontally');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mobilePreview:true,pageErrors:0,saveTransport:'intercepted; real persistence verified separately'}));
} catch(error) {
  if(page) console.log(JSON.stringify({previews,inputs:await page.getByRole('textbox',{name:'HTML template',exact:true}).allTextContents(),frames:await page.locator('iframe').evaluateAll(frames=>frames.map(frame=>({title:frame.title,html:frame.srcdoc.slice(0,250)}))),alerts:await page.getByRole('alert').allTextContents()}));
  throw error;
} finally {
  await page?.close({runBeforeUnload:false});
  await browser.close();
}
