import { chromium } from 'playwright-core';

const artifactDir = '/Users/ziggy/.gemini/antigravity-cli/brain/161989f6-a954-45d5-9d54-3d58af92a514';
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-background-networking'],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  console.log('Navigating to Mission Control Dashboard (?view=dashboard)...');
  await page.goto(`${base}/?view=dashboard`, { waitUntil: 'domcontentloaded' });

  // Wait for boot sequence
  await page.locator('.boot-sequence').waitFor({ state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1. Verify ASP Private Capital Agent OS Tracker header
  console.log('Verifying Agent OS Tracker presence...');
  await page.getByText('ASP Private Capital Agent Outreach OS').first().waitFor({ timeout: 10000 });
  await page.getByText('Live Telemetry').first().waitFor();
  console.log('Tracker header verified.');

  // 2. Verify Telemetry Cards
  await page.getByText('INBOX PLACEMENT').waitFor();
  await page.getByText('99.4%', { exact: true }).first().waitFor();
  await page.getByText('INBOUND ENGAGEMENT').waitFor();
  await page.getByText('24.8%', { exact: true }).first().waitFor();
  await page.getByText('INFLECTION HEALTH').waitFor();
  await page.getByText('94 / 100', { exact: true }).first().waitFor();
  await page.getByText('AUTONOMY RATIO').waitFor();
  await page.getByText('92.4%', { exact: true }).first().waitFor();
  console.log('Telemetry metrics verified.');

  // 3. Verify Agent Micro-Trackers
  await page.getByText('Prospector:').waitFor();
  await page.getByText('Dylan (Drafter):').waitFor();
  await page.getByText('Classifier:').waitFor();
  await page.getByText('Deliverability:').waitFor();
  console.log('Agent micro-trackers verified.');

  // 4. Verify Inflection Optimizations
  await page.getByText('Agent-Generated System Optimizations (Inflection Engine)').waitFor();
  await page.getByText('Sector Clarification Bottleneck in Secondary Outreach').waitFor();
  await page.getByText('Liaison Disclaimer Relocation & Friction Reduction').waitFor();
  console.log('Inflection recommendations verified.');

  // Scroll to make sure tracker is well-centered in screenshot
  const trackerEl = page.locator('text=ASP Private Capital Agent Outreach OS').first();
  await trackerEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  // Screenshot Dark Mode Dashboard with OS Tracker
  const darkPath = `${artifactDir}/agent-os-tracker-dark.png`;
  await page.screenshot({ path: darkPath, fullPage: false });
  console.log(`Saved Agent OS Tracker dark screenshot: ${darkPath}`);

  // 5. Open Review Draft Diff Modal
  console.log('Testing interactive Review Draft Diff modal...');
  const reviewBtn = page.getByRole('button', { name: /Review Draft Diff/i }).first();
  await reviewBtn.scrollIntoViewIfNeeded();
  await reviewBtn.click();
  await page.waitForTimeout(600);

  // Verify modal elements
  await page.getByText('CURRENT DRAFT PATTERN').waitFor({ timeout: 5000 });
  await page.getByText('OPTIMIZED INFLECTION DRAFT').waitFor();
  console.log('Draft Diff modal opened and content verified.');

  const modalPath = `${artifactDir}/agent-os-diff-modal.png`;
  await page.screenshot({ path: modalPath, fullPage: false });
  console.log(`Saved Draft Diff modal screenshot: ${modalPath}`);

  // 6. Test Applying Optimization
  console.log('Applying optimization refinement...');
  const applyBtn = page.getByRole('button', { name: /Apply This Refinement to Dylan Agent/i });
  await applyBtn.click();
  await page.waitForTimeout(1000);

  // Verify Toast Notification
  await page.getByText('Optimization Applied!').waitFor({ timeout: 5000 });
  console.log('Optimization applied and toast verified.');

  // Wait a moment for toast
  await page.waitForTimeout(600);

  // 7. Switch to Light Mode and capture
  console.log('Testing light mode...');
  const lightBtn = page.locator('button[aria-label="Switch to light mode"], button:has-text("Light")');
  if (await lightBtn.count() > 0) {
    await lightBtn.first().click();
    await page.waitForTimeout(800);
    const lightPath = `${artifactDir}/agent-os-tracker-light.png`;
    await page.screenshot({ path: lightPath, fullPage: false });
    console.log(`Saved Agent OS Tracker light screenshot: ${lightPath}`);
  }

  console.log('All Agent OS Tracker verification steps completed successfully!');
} catch (err) {
  console.error('Agent OS Tracker QA failed:', err);
  throw err;
} finally {
  await browser.close();
  if (errors.length > 0) {
    console.warn('Page errors encountered during QA:', errors);
  }
}
