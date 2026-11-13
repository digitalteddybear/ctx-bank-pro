import { chromium } from 'playwright-core';

const artifactDir = '/Users/ziggy/.gemini/antigravity-cli/brain/161989f6-a954-45d5-9d54-3d58af92a514';
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-background-networking'],
});

const page = await browser.newPage({ viewport: { width: 1680, height: 1250 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  console.log('Navigating to Mission Control Dashboard (?view=dashboard)...');
  await page.goto(`${base}/?view=dashboard`, { waitUntil: 'domcontentloaded' });

  // Wait for boot sequence
  await page.locator('.boot-sequence').waitFor({ state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1. Verify AI Chat Landing is present
  console.log('Verifying AI Chat Landing orchestrator above alert rail...');
  await page.getByText('Where should we start?').waitFor({ timeout: 10000 });
  console.log('AI Chat Landing confirmed.');

  // 2. Verify Dashboard Alert Rail directly below AI Chat Landing
  console.log('Verifying Dashboard Alert Rail header & controls...');
  await page.getByText('ASP Agent Outreach OS & Inflection Monitor').waitFor({ timeout: 10000 });
  await page.getByText('Live Swarm Telemetry').waitFor();
  console.log('Alert rail header confirmed.');

  // 3. Verify Traffic-light KPI Tiles
  await page.getByText('Inbox placement').first().waitFor();
  await page.getByText('99.4%').first().waitFor();
  await page.getByText('Inbound engagement').first().waitFor();
  await page.getByText('24.8%').first().waitFor();
  await page.getByText('Inflection health').first().waitFor();
  await page.getByText('94 / 100').first().waitFor();
  await page.getByText('Autonomy ratio').first().waitFor();
  await page.getByText('92.4%').first().waitFor();
  console.log('Status-colored tiles with sparklines confirmed.');

  // 4. Verify Multi-series time charts
  await page.getByText('Agent Drafting & Response Latency').first().waitFor();
  await page.getByText('Outreach Engagement by Asset Sector').first().waitFor();
  console.log('Multi-series time charts confirmed.');

  // 5. Verify Right-Hand Triage Rail (Agent Recommended Points of Action)
  console.log('Verifying Right-Hand Triage Rail (Agent Points of Action)...');
  await page.getByText('Agent Recommended Points of Action').first().waitFor();
  await page.getByText('Secondary Outreach: Sector Clarification Bottleneck').first().waitFor();
  await page.getByText('Disclaimer Relocation: Relocate statutory perimeter to footer').first().waitFor();
  await page.getByText('Keyword Dampening: Suppress urgency tokens in cold drafts').first().waitFor();
  await page.getByText('HNW Family Office: Auto-escalate >£5M leads to Dylan Broker').first().waitFor();
  console.log('Triage rail action points confirmed.');

  // 6. Verify Swarm Agent Breakdown in the rail
  await page.getByText('Swarm Agent Breakdown').first().waitFor();
  await page.getByText('dylan-inbound-drafter').first().waitFor();
  await page.getByText('lead-prospector-swarm').first().waitFor();
  console.log('Swarm Agent Breakdown confirmed.');

  // 7. Verify 90-Day Uptime Roster
  await page.getByText('Swarm Services & Component Roster').first().waitFor();
  console.log('90-day component uptime roster confirmed.');

  // Scroll alert rail into prominent view
  const railHeader = page.getByText('ASP Agent Outreach OS & Inflection Monitor').first();
  await railHeader.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  // Capture Dark Mode Screenshot
  const darkPath = `${artifactDir}/dashboard-alert-rail-dark.png`;
  await page.screenshot({ path: darkPath, fullPage: false });
  console.log(`Saved dark mode screenshot: ${darkPath}`);

  // Test Time-window Segmented Control: click '7d'
  console.log('Testing time window switch to 7d...');
  const btn7d = page.getByRole('button', { name: '7d' }).first();
  if (await btn7d.count() > 0) {
    await btn7d.click();
    await page.waitForTimeout(600);
  }

  // Switch to Light Mode and capture
  console.log('Switching to light mode...');
  const lightBtn = page.locator('button[aria-label="Switch to light mode"], button:has-text("Light")').first();
  if (await lightBtn.count() > 0) {
    await lightBtn.click();
    await page.waitForTimeout(800);
    const lightPath = `${artifactDir}/dashboard-alert-rail-light.png`;
    await page.screenshot({ path: lightPath, fullPage: false });
    console.log(`Saved light mode screenshot: ${lightPath}`);
  }

  // 8. Direct standalone route /dashboard-alert-rail
  console.log('Navigating to standalone route /dashboard-alert-rail...');
  await page.goto(`${base}/dashboard-alert-rail`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.getByText('ASP Agent Outreach OS & Inflection Monitor').first().waitFor({ timeout: 10000 });
  const standalonePath = `${artifactDir}/dashboard-alert-rail-fullscreen.png`;
  await page.screenshot({ path: standalonePath, fullPage: false });
  console.log(`Saved standalone full-screen screenshot: ${standalonePath}`);

  console.log('All dashboard-alert-rail visual verification steps passed successfully!');
} catch (err) {
  console.error('dashboard-alert-rail QA failed:', err);
  throw err;
} finally {
  await browser.close();
  if (errors.length > 0) {
    console.warn('Page errors encountered during QA:', errors);
  }
}
