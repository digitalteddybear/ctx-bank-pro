import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';

const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.error('PAGEERROR:', e.message); });
page.on('console', msg => console.log('LOG:', msg.text()));
let createdRevision;
const id = 'rag/readme';
try {
  await page.goto(`${base}/?view=architecture`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Architecture', exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('treegrid', { name: 'Architecture files' }).waitFor({ timeout: 60000 });
  await page.locator('.boot-sequence').waitFor({ state: 'hidden', timeout: 30000 });
  const grid = page.getByRole('treegrid');
  const first = grid.locator('tbody tr').first();
  await first.focus(); await page.keyboard.press('ArrowDown');
  assert.notEqual(await page.evaluate(() => document.activeElement?.getAttribute('data-architecture-id')), 'agents');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-architecture-id')), 'agents');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await first.getAttribute('aria-expanded'), 'false');
  await page.keyboard.press('ArrowRight');
  assert.equal(await first.getAttribute('aria-expanded'), 'true');
  await page.getByRole('textbox', { name: 'Search architecture' }).fill('engine.ts');
  await page.locator('tr[data-architecture-id="agents/runtime/engine.ts"]').waitFor();
  assert.equal(await grid.locator('tbody tr[data-architecture-id="rag"]').count(), 0);
  await page.getByRole('textbox', { name: 'Search architecture' }).fill('');
  await page.locator('tr[data-architecture-id="rag/readme"]').click();
  await page.locator('.architecture-detail .astryx-markdown').waitFor();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => { localStorage.setItem('ctxbankpro:theme-preference', t); document.documentElement.dataset.theme = t; }, theme);
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(400);
      const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, detail: document.querySelector('.architecture-detail')?.getBoundingClientRect().toJSON(), tree: document.querySelector('.architecture-layout .astryx-layout-content')?.getBoundingClientRect().toJSON() }));
      console.log(theme, width, JSON.stringify(metrics));
      assert.ok(metrics.scroll <= width + 1, 'page must not overflow horizontally');
      if (width < 1100) assert.ok(metrics.detail.y >= metrics.tree.bottom - 1, 'mobile detail must stack below tree');
      await page.screenshot({ path: `/private/tmp/ctx-architecture-${theme}-${width}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  console.log('Fetching original file...');
  const original = await page.evaluate(async id => (await fetch(`/api/architecture?file=${encodeURIComponent(id)}`)).json(), id);
  console.log('Original draft exists?', Boolean(original.draft));
  if (!original.draft) {
    console.log('Clicking Edit draft...');
    await page.getByRole('radio', { name: 'Edit draft', exact: true }).click();
    console.log('Filling draft content...');
    const editor = page.getByRole('textbox', { name: 'Draft content' });
    await editor.fill(`${original.content}\n<!-- Architecture browser QA draft -->\n`);
    console.log('Saving draft...');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Draft saved. Source and running behaviour are unchanged.').waitFor();
    console.log('Draft saved confirmed.');
    const saved = await page.evaluate(async id => (await fetch(`/api/architecture?file=${encodeURIComponent(id)}`)).json(), id);
    assert.equal(saved.content, original.content); assert.ok(saved.draft.content.includes('Architecture browser QA'));
    createdRevision = saved.draft.revision;
    await page.waitForTimeout(1500);
    console.log('Navigating to architecture view after save...');
    await page.goto(`${base}/?view=architecture`, { waitUntil: 'domcontentloaded' });
    await page.locator('.boot-sequence').waitFor({ state: 'hidden', timeout: 30000 });
    await page.getByRole('heading', { name: 'Architecture', exact: true }).waitFor({ timeout: 60000 });
    await page.getByRole('treegrid', { name: 'Architecture files' }).waitFor({ timeout: 60000 });
    console.log('Treegrid ready, clicking rag/readme...');
    await page.locator('tr[data-architecture-id="rag/readme"]').click();
    console.log('Clicking Edit draft radio...');
    await page.getByRole('radio', { name: 'Edit draft', exact: true }).click();
    await page.getByRole('textbox', { name: 'Draft content' }).waitFor();
    assert.ok((await page.getByRole('textbox', { name: 'Draft content' }).inputValue()).includes('Architecture browser QA'));
    console.log('Draft verified in editor!');
  }
  assert.deepEqual(errors, []);
  console.log('Architecture browser checks passed');
} finally {
  await browser.close();
  if (createdRevision) {
    const target = `data/architecture-drafts/${createHash('sha256').update(id).digest('hex')}.json`;
    const draft = JSON.parse(await readFile(target, 'utf8'));
    if (draft.revision === createdRevision) await unlink(target);
  }
}
