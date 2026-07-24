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
await page.getByRole("heading", { name: "Knowledge graph status" }).waitFor();
await page.locator(".graph-loading").waitFor({ state: "hidden", timeout: 10_000 });
const dashboardVisible = await page.getByText("Graph and document status").isVisible();
await page.waitForTimeout(700);
await page.screenshot({
  path: path.join(outputDirectory, "dashboard.png"),
  fullPage: true,
});

await page.getByRole("button", { name: "Upload document" }).click();
await page.getByRole("heading", { name: "Upload a document" }).waitFor();
await page.getByRole("button", { name: "Close upload" }).click();

await page.keyboard.press("Meta+K");
await page.getByPlaceholder(/Search node titles/i).fill("Bulletproof Offer");
await page.locator(".command-results button").first().click();
await page.getByRole("heading", { name: "Bulletproof Offer™" }).first().waitFor();
await page.getByTestId("knowledge-graph-2d").waitFor();
await page.getByTestId("knowledge-graph-2d").locator('[data-node-id="bulletproof-offer"]').waitFor();
await page.waitForTimeout(700);

const semanticNodeCount = await page.getByTestId("knowledge-graph-2d").locator("[data-node-id]").count();
const semanticLinkCount = await page.getByTestId("knowledge-graph-2d").locator("[data-link-id]").count();
const selectedNode = page.getByTestId("knowledge-graph-2d").locator('[data-node-id="bulletproof-offer"]');
const selectedNodeAccessible =
  (await selectedNode.getAttribute("role")) === "button" &&
  (await selectedNode.getAttribute("tabindex")) === "0" &&
  Boolean(await selectedNode.getAttribute("aria-label"));

await page.getByRole("button", { name: "Focus one-hop neighborhood" }).click();
await page.waitForTimeout(500);
const neighborhoodNodeCount =
  await page.getByTestId("knowledge-graph-2d").locator("[data-node-id]").count();
await page.getByRole("button", { name: "Focus one-hop neighborhood" }).click();
await page.waitForTimeout(500);

await page.getByRole("button", { name: "Start shortest path" }).click();
const pathDestination = page
  .getByTestId("knowledge-graph-2d")
  .locator('[data-node-id="strategic-synthesis"]');
await pathDestination.focus();
await pathDestination.press("Enter");
await page.getByRole("button", { name: "Start shortest path" }).waitFor();
await page.waitForTimeout(350);
const pathHighlightedNodeCount =
  await page.getByTestId("knowledge-graph-2d").locator(".is-highlighted").count();

await page.screenshot({
  path: path.join(outputDirectory, "network.png"),
  fullPage: true,
});

await page.getByRole("button", { name: "3D graph" }).click();
await page.locator(".graph-loading").waitFor({ state: "hidden", timeout: 10_000 });
await page.waitForTimeout(500);
const graphCanvasCount = await page.locator("canvas").count();
await page.getByRole("button", { name: "2D map" }).click();
await page.getByTestId("knowledge-graph-2d").waitFor();

const report = {
  title: await page.title(),
  dashboardVisible,
  graphCanvasCount,
  netronMapVerified: semanticNodeCount > 0 && semanticLinkCount > 0,
  netronSemanticNodes: semanticNodeCount,
  netronSemanticLinks: semanticLinkCount,
  selectedNodeAccessible,
  neighborhoodVerified:
    neighborhoodNodeCount > 0 && neighborhoodNodeCount < semanticNodeCount,
  shortestPathVerified: pathHighlightedNodeCount >= 2,
  rendererSwitchVerified: graphCanvasCount >= 1,
  documentUploadAvailable: await page.getByRole("button", { name: "Upload document" }).isVisible(),
  humanKnowledgeMutationControls:
    (await page.getByRole("button", { name: /Add knowledge|Edit|Deprecate|Remove node|Connect/i }).count()),
  commandSearchVerified: true,
  inspectorVerified: await page.getByText("Record metadata").isVisible(),
  pageErrors,
  consoleErrors,
};

await page.goto(`${baseUrl}/extension`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.getByRole("heading", { name: "Knowledge Network extension" }).waitFor();
const extensionDocsVerified =
  (await page.getByRole("heading", { name: "MCP tools" }).count()) === 0 &&
  (await page.getByRole("heading", { name: "Read tools" }).isVisible()) &&
  (await page.getByText("14", { exact: true }).first().isVisible()) &&
  (await page.getByRole("link", { name: "Open graph" }).isVisible());
await page.locator("#mcp").scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
const extensionScrollSpyVerified =
  (await page.locator('nav[aria-label="Documentation sections"] a[href="#mcp"]')
    .getAttribute("aria-current")) === "location";
await page.screenshot({
  path: path.join(outputDirectory, "extension.png"),
  fullPage: true,
});

const mobilePage = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
await mobilePage.goto(`${baseUrl}/extension`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await mobilePage.getByRole("heading", { name: "Knowledge Network extension" }).waitFor();
const extensionMobileVerified =
  (await mobilePage.getByRole("link", { name: "Open graph" }).isVisible()) &&
  (await mobilePage.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth));
await mobilePage.screenshot({
  path: path.join(outputDirectory, "extension-mobile.png"),
  fullPage: true,
});
await mobilePage.close();

report.extensionDocsVerified = extensionDocsVerified;
report.extensionScrollSpyVerified = extensionScrollSpyVerified;
report.extensionMobileVerified = extensionMobileVerified;
console.log(JSON.stringify(report, null, 2));
await browser.close();

if (
  pageErrors.length ||
  consoleErrors.length ||
  !report.dashboardVisible ||
  !report.netronMapVerified ||
  !report.selectedNodeAccessible ||
  !report.neighborhoodVerified ||
  !report.shortestPathVerified ||
  !report.rendererSwitchVerified ||
  report.humanKnowledgeMutationControls > 0 ||
  !report.extensionDocsVerified ||
  !report.extensionScrollSpyVerified ||
  !report.extensionMobileVerified
) {
  process.exitCode = 1;
}
