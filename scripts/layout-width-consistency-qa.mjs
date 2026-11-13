import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const artifactDir = '/Users/ziggy/.gemini/antigravity-cli/brain/161989f6-a954-45d5-9d54-3d58af92a514';
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-background-networking'],
});

const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const views = [
  { name: 'agents', title: 'Agents (Benchmark)', url: `${base}/?view=agents`, selector: '.agents-view' },
  { name: 'dashboard', title: 'Mission Control Dashboard', url: `${base}/?view=dashboard`, selector: '.dashboard-workspace-wrap' },
  { name: 'sources', title: 'Documents & Sources', url: `${base}/?view=sources`, selector: '.sources-view' },
  { name: 'catalog', title: 'System Catalog', url: `${base}/?view=catalog`, selector: '.catalog-workspace-wrap' },
  { name: 'extension-docs', title: 'Documentation Page', url: `${base}/extension`, selector: '.docs-workspace-wrap' },
];

console.log('Testing layout width consistency and side navigation sizing across all views...');

for (const v of views) {
  await page.goto(v.url, { waitUntil: 'domcontentloaded' });
  const boot = page.locator('.boot-sequence');
  if (await boot.count() > 0) {
    try {
      await boot.waitFor({ state: 'hidden', timeout: 5000 });
    } catch {}
  }
  await page.waitForTimeout(600);

  const measurements = await page.evaluate((sel) => {
    const nav = document.querySelector('nav');
    const navRect = nav ? nav.getBoundingClientRect() : null;

    const target = document.querySelector(sel);
    const tRect = target ? target.getBoundingClientRect() : null;
    const tStyle = target ? window.getComputedStyle(target) : null;

    return {
      navWidth: navRect ? Math.round(navRect.width) : null,
      targetFound: !!target,
      width: tRect ? Math.round(tRect.width) : null,
      left: tRect ? Math.round(tRect.left) : null,
      right: tRect ? Math.round(tRect.right) : null,
      maxWidth: tStyle ? tStyle.maxWidth : null,
      paddingLeft: tStyle ? tStyle.paddingLeft : null,
      paddingRight: tStyle ? tStyle.paddingRight : null,
    };
  }, v.selector);

  console.log(`[${v.title}]`, measurements);

  // Assertions
  assert.equal(measurements.navWidth, 280, `SideNav on ${v.title} must be exactly 280px`);
  assert.equal(measurements.targetFound, true, `Content target on ${v.title} must be present`);
  assert.equal(measurements.width, 1500, `Content width on ${v.title} must be exactly 1500px`);
  assert.equal(measurements.maxWidth, '1500px', `Content maxWidth on ${v.title} must be 1500px`);
  assert.equal(measurements.left, 350, `Content left alignment on ${v.title} must be 350px`);
  assert.equal(measurements.right, 1850, `Content right alignment on ${v.title} must be 1850px`);
  assert.equal(measurements.paddingLeft, '40px', `Content horizontal paddingLeft on ${v.title} must be 40px`);
  assert.equal(measurements.paddingRight, '40px', `Content horizontal paddingRight on ${v.title} must be 40px`);

  // Take screenshot
  const screenshotPath = `${artifactDir}/layout-${v.name}-1920.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Saved screenshot: ${screenshotPath}`);
}

assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
console.log('All layout consistency assertions PASSED successfully!');

await browser.close();
