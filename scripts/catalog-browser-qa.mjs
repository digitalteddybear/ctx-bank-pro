import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const artifactDir = '/Users/ziggy/.gemini/antigravity-cli/brain/161989f6-a954-45d5-9d54-3d58af92a514';
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
  console.log('Navigating to System Catalog (?view=catalog)...');
  await page.goto(`${base}/?view=catalog`, { waitUntil: 'domcontentloaded' });

  // Wait for boot sequence
  await page.locator('.boot-sequence').waitFor({ state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Verify Catalog Header & Stats
  await page.locator('h1').filter({ hasText: 'System Catalog & Feature Registry' }).waitFor({ timeout: 10000 });
  await page.getByText('SECTIONS', { exact: true }).waitFor();
  await page.getByText('REGISTERED FEATURES', { exact: true }).waitFor();
  await page.getByText('ASTRYX TEMPLATES', { exact: true }).waitFor();
  console.log('Catalog Header & KPI metrics verified.');

  // Verify Sections rendered
  await page.getByText('SEC-WORKSPACE-OVERVIEW', { exact: true }).waitFor();
  await page.getByText('SEC-AGENTS-OPS', { exact: true }).waitFor();
  await page.getByText('SEC-REPOSITORY-ARCH', { exact: true }).waitFor();
  console.log('Section registry cards verified.');

  // Verify Feature Inventory table
  await page.getByRole('table').getByText('FEAT-AI-CHAT', { exact: true }).waitFor();
  await page.getByRole('table').getByText('FEAT-INBOX-QUEUE', { exact: true }).waitFor();
  await page.getByRole('table').getByText('FEAT-BUILTIN-IDE', { exact: true }).waitFor();
  await page.getByRole('table').getByText('FEAT-TREE-TABLE', { exact: true }).waitFor();
  console.log('Feature and template inventory rows verified.');

  // Dark mode screenshot
  const catalogDarkPath = `${artifactDir}/system-catalog-dark.png`;
  await page.screenshot({ path: catalogDarkPath, fullPage: false });
  console.log(`Saved catalog dark screenshot: ${catalogDarkPath}`);

  // Switch to light mode
  const lightBtn = page.locator('button[aria-label="Switch to light mode"], button:has-text("Light")');
  if (await lightBtn.count() > 0) {
    await lightBtn.first().click();
    await page.waitForTimeout(500);
    const catalogLightPath = `${artifactDir}/system-catalog-light.png`;
    await page.screenshot({ path: catalogLightPath, fullPage: false });
    console.log(`Saved catalog light screenshot: ${catalogLightPath}`);
  }

  // Navigate to documentation page
  console.log('Navigating to Documentation (/extension#taxonomy)...');
  await page.goto(`${base}/extension#taxonomy`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  await page.getByText('04 / Section & Feature Catalog').waitFor({ timeout: 10000 });
  await page.getByText('Open Interactive System Catalog Dashboard').waitFor();
  console.log('Extension docs taxonomy section verified.');

  const docsPath = `${artifactDir}/extension-docs-taxonomy.png`;
  await page.screenshot({ path: docsPath, fullPage: false });
  console.log(`Saved docs screenshot: ${docsPath}`);

  // Navigate to Agents View to verify inbox table
  console.log('Navigating to Agents view (?view=agents)...');
  await page.goto(`${base}/?view=agents`, { waitUntil: 'domcontentloaded' });
  await page.locator('.boot-sequence').waitFor({ state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Check Inbox tab is active or click it
  const inboxTab = page.getByRole('button', { name: /Inbox/i });
  if (await inboxTab.count() > 0) {
    await inboxTab.first().click();
    await page.waitForTimeout(800);
  }
  const agentsInboxPath = `${artifactDir}/agents-inbox-verified.png`;
  await page.screenshot({ path: agentsInboxPath, fullPage: false });
  console.log(`Saved agents inbox screenshot: ${agentsInboxPath}`);

  console.log('All visual verification steps completed successfully!');
} catch (err) {
  console.error('Visual verification failed:', err);
  throw err;
} finally {
  await browser.close();
  if (errors.length > 0) {
    console.warn('Page errors encountered during QA:', errors);
  }
}
