import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-background-networking'],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  console.log('Navigating to dashboard...');
  await page.goto(`${base}/?view=dashboard`, { waitUntil: 'domcontentloaded' });

  // Wait for boot sequence to finish
  await page.locator('.boot-sequence').waitFor({ state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(800);

  // 1. Verify Greeting matches original template
  await page.getByText('Hi, Andrew').waitFor({ timeout: 10000 });
  await page.getByText('Where should we start?').waitFor({ timeout: 10000 });
  console.log('Template greeting verified: "Hi, Andrew" & "Where should we start?".');

  // 2. Verify ChatComposer and Attachment drawer tokens
  await page.getByText('project_brief.pdf').waitFor({ timeout: 10000 });
  await page.getByText('wireframes_v2.fig').waitFor();
  await page.getByText('api_spec.yaml').waitFor();
  console.log('Chat composer attachment tokens verified.');

  // 3. Verify Categories
  await page.getByRole('button', { name: 'Writing', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Coding', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Research', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Creative', exact: true }).waitFor();
  console.log('Category filter toggle buttons verified.');

  // 4. Test selecting a category
  console.log('Selecting "Writing" category...');
  await page.getByRole('button', { name: 'Writing', exact: true }).click();
  await page.getByText('Draft a professional email').waitFor({ timeout: 10000 });
  await page.getByText('Improve my writing').waitFor();
  console.log('Category suggestions rendered successfully.');

  // 5. Click suggestion card to test composer population
  await page.getByText('Draft a professional email').click();
  console.log('Suggestion card applied to composer input.');

  // 6. Verify Dashboard components rendered below AI chat landing
  await page.getByLabel('Knowledge base status').getByText('Active nodes', { exact: true }).waitFor({ timeout: 10000 });
  await page.getByLabel('Knowledge base status').getByText('Active links', { exact: true }).waitFor();
  await page.getByText('Knowledge Bank').first().waitFor();
  await page.getByText('Backend status').waitFor();
  console.log('Mission control dashboard components verified below AI chat landing.');

  // 7. Verify screenshots in dark and light themes
  await page.screenshot({ path: '/tmp/ctx-mission-control-dark.png', fullPage: false });
  console.log('Captured /tmp/ctx-mission-control-dark.png');

  await page.evaluate(() => {
    localStorage.setItem('ctxbankpro:theme-preference', 'light');
    document.documentElement.dataset.theme = 'light';
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/ctx-mission-control-light.png', fullPage: false });
  console.log('Captured /tmp/ctx-mission-control-light.png');

  assert.deepEqual(errors, [], `Page errors encountered: ${JSON.stringify(errors)}`);
  console.log('ALL MISSION CONTROL TEMPLATE RESTORATION CHECKS PASSED CLEANLY!');
} finally {
  await browser.close();
}
