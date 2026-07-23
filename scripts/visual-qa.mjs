import { chromium } from "playwright-core";
import path from "node:path";
import process from "node:process";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const outputDirectory = process.cwd();
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-background-networking",
  ],
});

const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
await page.addInitScript(() => localStorage.clear());

const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
await page.getByRole("heading", { name: "Knowledge base observatory" }).waitFor();
await page.locator(".graph-loading").waitFor({ state: "hidden", timeout: 10_000 });
const dashboardVisible = await page.getByText("Agent-maintained knowledge system").isVisible();
await page.screenshot({
  path: path.join(outputDirectory, "dashboard.png"),
  fullPage: true,
});

await page.getByRole("button", { name: "Add documentation" }).click();
await page.getByRole("heading", { name: "Add source documentation" }).waitFor();
await page.getByRole("button", { name: "Close upload" }).click();

await page.keyboard.press("Meta+K");
await page.getByPlaceholder(/Search frameworks/i).fill("Bulletproof Offer");
await page.locator(".command-results button").first().click();
await page.getByRole("heading", { name: "Bulletproof Offer™" }).first().waitFor();
await page.locator(".graph-loading").waitFor({ state: "hidden", timeout: 10_000 });
await page.waitForTimeout(700);
await page.screenshot({
  path: path.join(outputDirectory, "network.png"),
  fullPage: true,
});

const report = {
  title: await page.title(),
  dashboardVisible,
  graphCanvasCount: await page.locator("canvas").count(),
  documentUploadAvailable: await page.getByRole("button", { name: "Add documentation" }).isVisible(),
  humanKnowledgeMutationControls:
    (await page.getByRole("button", { name: /Add knowledge|Edit|Deprecate|Remove node|Connect/i }).count()),
  commandSearchVerified: true,
  inspectorVerified: await page.getByText("Knowledge integrity").isVisible(),
  pageErrors,
  consoleErrors,
};

console.log(JSON.stringify(report, null, 2));
await browser.close();

if (
  pageErrors.length ||
  consoleErrors.length ||
  report.graphCanvasCount < 1 ||
  report.humanKnowledgeMutationControls > 0
) {
  process.exitCode = 1;
}
