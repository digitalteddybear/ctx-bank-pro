import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
const commands = [];
page.on('pageerror', error => errors.push(error.message));
const runs = ['queued', 'held', 'awaiting_approval', 'booked'].map((status, index) => ({ id:`qa-${index}`, status, next:'prospect', createdAt:Date.now(), sandbox:true, synthetic:true, inference:'fixture', transcript:[], prospect:{id:`p-${index}`, name:`QA contact ${index}`, email:`qa${index}@example.test`}, draft:{subject:`QA thread ${index}`, body:'Backend mapping fixture', hash:'test'} }));
await page.route('**/api/agents**', async route => {
  const request = route.request();
  if (request.method() === 'POST') { commands.push(request.postDataJSON()); return route.fulfill({json:{ok:true, status:'received'}}); }
  const pathname = new URL(request.url()).pathname;
  return route.fulfill({json:pathname.endsWith('/runs') ? runs : pathname.endsWith('/instructions') ? [] : {agents:[{id:'prospect', paused:false, runs:[]}], orchestrator:{recentMessages:[]}}});
});
try {
  await page.goto('http://127.0.0.1:3000/?view=dashboard', {waitUntil:'domcontentloaded'});
  await page.locator('.boot-sequence').waitFor({state:'hidden', timeout:30000});
  await page.getByText('CTX orchestrator', {exact:true}).waitFor();
  assert.equal(await page.getByText('project_brief.pdf', {exact:true}).count(), 0);
  const composer = page.locator('[contenteditable="true"]').first();
  await composer.fill('Inspect the knowledge pipeline');
  await composer.press('Enter');
  await page.getByText('Instruction received by the orchestrator. Workflow execution requires review.').waitFor();
  assert.equal(commands[0].action, 'dispatch-instruction');
  assert.equal(commands[0].text, 'Inspect the knowledge pipeline');
  await page.goto('http://127.0.0.1:3000/?view=agents', {waitUntil:'domcontentloaded'});
  await page.locator('.boot-sequence').waitFor({state:'hidden', timeout:30000});
  await page.getByText('QA thread 0', {exact:true}).first().waitFor();
  assert.equal(await page.getByText('QA thread 1', {exact:true}).count(), 0);
  await page.getByRole('button', {name:'Operator Takeover — QA thread 0', exact:true}).first().click({force:true});
  await page.waitForTimeout(300);
  assert.ok(commands.some(command => command.action === 'takeover' && command.id === 'qa-0'));
  await page.getByRole('button', {name:'Reply', exact:true}).first().click();
  await page.getByRole('textbox', {name:'Message', exact:true}).fill('A simulated inbound reply');
  await page.getByRole('button', {name:'Record reply', exact:true}).click();
  await page.waitForTimeout(300);
  assert.ok(commands.some(command => command.action === 'reply' && command.id === 'qa-0' && command.text === 'A simulated inbound reply'));
  for (const width of [1600, 390]) {
    await page.setViewportSize({width, height:1000});
    await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow');
  }
  await page.setViewportSize({width:1600, height:1000});
  console.log('Checking architecture IDE…');
  await page.goto('http://127.0.0.1:3000/?view=architecture', {waitUntil:'domcontentloaded'});
  await page.locator('.boot-sequence').waitFor({state:'hidden', timeout:30000});
  await page.locator('tr[data-architecture-id="rag/readme"]').click();
  await page.getByRole('button', {name:'Open in IDE Overlay'}).click();
  const editor = page.getByRole('textbox', {name:'Source draft'});
  await editor.waitFor();
  assert.ok((await editor.inputValue()).length > 0);
  let saved;
  await page.route('**/api/architecture', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    saved = route.request().postDataJSON();
    return route.fulfill({json:{content:saved.content, baseHash:saved.baseHash, revision:crypto.randomUUID(), savedAt:new Date().toISOString()}});
  });
  await editor.fill('Reviewable architecture draft');
  await editor.press('Meta+s');
  await page.waitForTimeout(500);
  assert.equal(saved?.id, 'rag/readme');
  assert.equal(saved?.content, 'Reviewable architecture draft');
  assert.deepEqual(errors, []);
  console.log('Chat dispatch, live-only inbox, takeover, reply, IDE save shortcut and responsive checks passed. API writes were intercepted.');
} finally { await browser.close(); }
