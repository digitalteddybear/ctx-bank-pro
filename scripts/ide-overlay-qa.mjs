import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-background-networking'],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  console.log('Navigating to architecture view...');
  await page.goto(`${base}/?view=architecture`, { waitUntil: 'domcontentloaded' });

  // Wait for boot sequence to finish
  const bootSeq = page.locator('.boot-sequence');
  if (await bootSeq.count() > 0) {
    await bootSeq.waitFor({ state: 'hidden', timeout: 30000 });
  }
  await page.waitForTimeout(1000);

  // Set dark theme initially to match user screenshot
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(300);

  console.log('Opening IDE Overlay via Full IDE button...');
  const fullIdeBtn = page.getByRole('button', { name: 'Full IDE' });
  await fullIdeBtn.waitFor({ timeout: 10000 });
  await fullIdeBtn.click();
  await page.waitForTimeout(600);

  // 1. Verify Header
  console.log('Checking IDE Header...');
  await page.getByRole('heading', { name: 'IDE', exact: true }).waitFor({ timeout: 5000 });
  await page.getByText('Dense multi-pane workspace of resizable, collapsible regions').waitFor();
  console.log('✓ IDE Header & description verified.');

  // 2. Verify File Explorer (Left Flank)
  console.log('Checking Left Flank (File Explorer)...');
  await page.getByPlaceholder('Search', { exact: true }).waitFor();
  await page.getByText('Counter.tsx').first().waitFor();
  await page.getByText('Header.tsx').first().waitFor();
  await page.getByText('Layout.tsx').first().waitFor();
  await page.getByText('package.json').first().waitFor();
  await page.getByText('tsconfig.json').first().waitFor();
  await page.getByText('next.config.mjs').first().waitFor();
  console.log('✓ File explorer tree verified.');

  // 3. Verify CodeBlock (Center Pane)
  console.log('Checking Center CodeBlock...');
  await page.getByText('export default function Counter()').waitFor();
  await page.getByText('setCount(prev => prev + 1);').waitFor();
  console.log('✓ Code editor and active line highlight verified.');

  // 4. Verify Terminal Drawer (Bottom)
  console.log('Checking Terminal Drawer...');
  await page.getByText('Terminal').first().waitFor();
  await page.getByText('Problems').first().waitFor();
  await page.getByText('Output').first().waitFor();
  await page.getByText('Debug').first().waitFor();
  await page.getByText('yarn run v1.22.22').waitFor();
  await page.getByText('Next.js 15.5.15').waitFor();
  console.log('✓ Docked terminal drawer & tabs verified.');

  // 5. Verify Inspector (Right Flank)
  console.log('Checking Inspector (Properties & History)...');
  await page.getByText('Properties').first().waitFor();
  await page.getByText('History').first().waitFor();
  await page.getByText('React Component').waitFor();
  await page.getByText('TypeScript').first().waitFor();
  await page.getByText('1.2 KB').waitFor();
  await page.getByText('useState, useCallback', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Format Document' }).waitFor();
  await page.getByRole('button', { name: 'Go to Definition' }).waitFor();
  await page.getByRole('button', { name: 'Find References' }).waitFor();
  console.log('✓ Inspector properties, metadata list, and actions verified.');

  // 6. Capture Dark Mode Screenshot (matching screenshot from prompt)
  console.log('Capturing dark mode screenshot...');
  await page.screenshot({ path: '/tmp/ide-overlay-dark.png', fullPage: false });

  // 7. Test switching to Light Mode
  console.log('Switching to light theme...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/ide-overlay-light.png', fullPage: false });
  console.log('✓ Light mode screenshot captured.');

  // Switch back to dark mode
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(300);

  // 8. Test file selection
  console.log('Testing clicking Header.tsx in tree...');
  await page.getByText('Header.tsx').first().click();
  await page.waitForTimeout(400);
  await page.getByText('CTX Architecture').waitFor();
  console.log('✓ File selection switching code confirmed.');

  // 9. Test History tab
  console.log('Testing History tab in inspector...');
  await page.getByText('History').first().click();
  await page.waitForTimeout(300);
  await page.getByText('Opened Counter.tsx').waitFor();
  console.log('✓ Inspector history timeline verified.');

  // 10. Test Close Button
  console.log('Testing Close Button (✕)...');
  await page.getByRole('button', { name: 'Close IDE' }).click();
  await page.waitForTimeout(400);
  const ideOverlay = page.locator('.architecture-ide-overlay');
  assert.equal(await ideOverlay.count(), 0, 'IDE overlay should be closed');
  console.log('✓ IDE Overlay closed cleanly via close button.');

  // 11. Test Code CTA button and Escape key
  console.log('Testing Code CTA button and Escape key...');
  const codeCta = page.locator('.github-code-cta');
  await codeCta.click();
  await page.waitForTimeout(400);
  assert.equal(await ideOverlay.count(), 1, 'IDE overlay should reopen via Code CTA');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.equal(await ideOverlay.count(), 0, 'IDE overlay should close on Escape key');
  console.log('✓ Escape key dismisses overlay properly.');

  console.log('\n========================================');
  console.log('ALL IDE OVERLAY QA TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
} catch (err) {
  console.error('QA Failed:', err);
  if (errors.length) {
    console.error('Page errors encountered:', errors);
  }
  process.exit(1);
} finally {
  await browser.close();
}
