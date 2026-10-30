import { chromium } from "playwright-core";
import path from "node:path";
import process from "node:process";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const outputDirectory = process.cwd();
const captureScreenshots = process.env.QA_CAPTURE_SCREENSHOTS === "1";
const capture = async (targetPage, name) => {
  if (!captureScreenshots) return;
  await targetPage.screenshot({
    path: path.join(outputDirectory, name),
    fullPage: true,
  });
};
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

try {
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

await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
const bootScreen = page.locator(".boot-sequence");
await bootScreen.waitFor({ state: "visible", timeout: 1_000 });
const bootScreenMinimal = await bootScreen.evaluate((element) => {
  const style = getComputedStyle(element);
  const logo = element.querySelector(".boot-logo");
  const progress = element.querySelector(".boot-progress span");
  return element.textContent?.trim() === "" &&
    Boolean(logo) &&
    Boolean(progress) &&
    style.backgroundImage === "none" &&
    getComputedStyle(progress).backgroundImage === "none";
});
await bootScreen.waitFor({ state: "hidden", timeout: 20_000 });
await page.getByRole("heading", { name: "Knowledge Bank Status" }).waitFor();
await page.locator(".graph-loading").waitFor({ state: "hidden", timeout: 30_000 });
const dashboardVisible = await page.getByText("Graph and document status").isVisible();
const themeTokensVerified = await page.evaluate(() => {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue("--background").trim() === "#171717" &&
    style.getPropertyValue("--primary").trim() === "#3b82f6" &&
    style.getPropertyValue("--border").trim() === "#404040" &&
    style.getPropertyValue("--font-sans").trim() === "Inter, sans-serif";
});
const brandAssetVerified = await page.locator('.wc-mark img[src="/assets/vector-2-header.svg"]')
  .evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);
const headingCapitalizationApplied =
  await page.getByRole("heading", { name: "Knowledge Bank Status" })
    .evaluate((heading) => getComputedStyle(heading).textTransform === "capitalize");
const navigationIcon = page.locator(".rail .icon-button:not(.is-active)").first();
const navigationIconBordersVerified = await navigationIcon.evaluate((button) => {
  const buttonStyle = getComputedStyle(button);
  const icon = button.querySelector("svg");
  const iconStyle = icon ? getComputedStyle(icon) : null;
  return buttonStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
    buttonStyle.borderTopWidth === "1px" &&
    iconStyle?.color === "rgb(255, 255, 255)";
});
const panelIconsWhiteVerified = await page.locator(".panel-heading > svg").first()
  .evaluate((icon) => getComputedStyle(icon).color === "rgb(255, 255, 255)");
await page.waitForTimeout(700);
await capture(page, "dashboard.png");

await page.getByRole("button", { name: "Upload document" }).click({ force: true });
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
const toolbarBox = await page.getByLabel("Knowledge map controls").boundingBox();
const viewSwitchBox =
  await page.getByRole("group", { name: "Knowledge Bank view" }).boundingBox();
const graphControlsAligned =
  Boolean(toolbarBox && viewSwitchBox && Math.abs(toolbarBox.y - viewSwitchBox.y) <= 4);
const zoomControlBordersVerified =
  await page.getByRole("button", { name: "Zoom in" }).evaluate((button) => {
    const style = getComputedStyle(button);
    return style.borderTopWidth === "1px" && style.backgroundColor !== "rgba(0, 0, 0, 0)";
  });
const canvasHeadingRemoved =
  (await page.locator(".network-canvas-heading h1, .network-canvas-heading .eyebrow").count()) === 0;
const contextBankHeaderVerified =
  (await page.locator(".product-name").textContent())?.includes("Context Bank") ?? false;

const graphViewport = page.getByTestId("knowledge-graph-viewport");
const graphCanvas = page.getByTestId("knowledge-graph-canvas");
const canvasWidthBeforeZoom = (await graphCanvas.boundingBox())?.width ?? 0;
const browserScaleBeforeZoom = await page.evaluate(() => window.devicePixelRatio);
const viewportBox = await graphViewport.boundingBox();
if (!viewportBox) throw new Error("Knowledge graph viewport has no bounding box.");
await page.mouse.move(
  viewportBox.x + viewportBox.width * 0.48,
  viewportBox.y + viewportBox.height * 0.48,
);
await page.keyboard.down("Control");
await page.mouse.wheel(0, -320);
await page.keyboard.up("Control");
await page.waitForTimeout(40);
const canvasWidthDuringZoom = (await graphCanvas.boundingBox())?.width ?? 0;
await page.waitForTimeout(500);
const canvasWidthAfterZoom = (await graphCanvas.boundingBox())?.width ?? 0;
const browserScaleAfterZoom = await page.evaluate(() => window.devicePixelRatio);

const scrollBeforePan = await graphViewport.evaluate((element) => ({
  left: element.scrollLeft,
  top: element.scrollTop,
}));
await page.mouse.move(viewportBox.x + 24, viewportBox.y + viewportBox.height * 0.55);
await page.mouse.down();
await page.mouse.move(
  viewportBox.x - 96,
  viewportBox.y + viewportBox.height * 0.55 - 70,
  { steps: 5 },
);
await page.mouse.up();
await page.waitForTimeout(100);
const scrollAfterPan = await graphViewport.evaluate((element) => ({
  left: element.scrollLeft,
  top: element.scrollTop,
}));

await page.getByRole("button", { name: "Focus one-hop neighborhood" }).click();
await page.waitForTimeout(500);
const neighborhoodNodeCount =
  await page.getByTestId("knowledge-graph-2d").locator("[data-node-id]").count();
await graphCanvas.click({ position: { x: 6, y: 6 }, force: true });
await page.waitForTimeout(500);
const openSpaceResetVerified =
  (await page.getByTestId("knowledge-graph-2d").locator("[data-node-id]").count()) ===
    semanticNodeCount &&
  (await page.getByRole("button", { name: "Focus one-hop neighborhood" }).isDisabled()) &&
  (await page.locator(".inspector").count()) === 0;

await selectedNode.focus();
await selectedNode.press("Enter");
await page.getByText("Record metadata").waitFor();

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

await capture(page, "network.png");

await page.getByRole("button", { name: "3D graph" }).click();
await page.locator(".graph-loading").waitFor({ state: "hidden", timeout: 30_000 });
await page.waitForTimeout(500);
const graphCanvasCount = await page.locator("canvas").count();
await page.getByRole("button", { name: "2D map" }).click();
await page.getByTestId("knowledge-graph-2d").waitFor();

const report = {
  title: await page.title(),
  dashboardVisible,
  bootScreenMinimal,
  themeTokensVerified,
  graphCanvasCount,
  netronMapVerified: semanticNodeCount > 0 && semanticLinkCount > 0,
  netronSemanticNodes: semanticNodeCount,
  netronSemanticLinks: semanticLinkCount,
  selectedNodeAccessible,
  brandAssetVerified,
  headingCapitalizationApplied,
  navigationIconBordersVerified,
  panelIconsWhiteVerified,
  graphControlsAligned,
  zoomControlBordersVerified,
  canvasHeadingRemoved,
  contextBankHeaderVerified,
  canvasZoomMeasurements: {
    before: Math.round(canvasWidthBeforeZoom),
    during: Math.round(canvasWidthDuringZoom),
    after: Math.round(canvasWidthAfterZoom),
    browserScaleBeforeZoom,
    browserScaleAfterZoom,
  },
  canvasZoomVerified:
    canvasWidthAfterZoom > canvasWidthBeforeZoom * 1.2 &&
    browserScaleAfterZoom === browserScaleBeforeZoom,
  progressiveZoomVerified:
    canvasWidthDuringZoom > canvasWidthBeforeZoom &&
    canvasWidthAfterZoom > canvasWidthDuringZoom,
  canvasPanVerified:
    scrollAfterPan.left !== scrollBeforePan.left ||
    scrollAfterPan.top !== scrollBeforePan.top,
  neighborhoodVerified:
    neighborhoodNodeCount > 0 && neighborhoodNodeCount < semanticNodeCount,
  openSpaceResetVerified,
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
await page.getByRole("heading", { name: "Knowledge Bank Extension" }).waitFor();
const extensionDocsVerified =
  (await page.getByRole("heading", { name: "MCP tools" }).count()) === 0 &&
  (await page.getByRole("heading", { name: "Read tools" }).isVisible()) &&
  (await page.getByText("14", { exact: true }).first().isVisible()) &&
  (await page.getByRole("link", { name: "Open Knowledge Bank" }).isVisible());
await page.locator("#mcp").scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
const extensionScrollSpyVerified =
  (await page.locator('nav[aria-label="Documentation sections"] a[href="#mcp"]')
    .getAttribute("aria-current")) === "location";
await capture(page, "extension.png");

const mobilePage = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
await mobilePage.goto(`${baseUrl}/extension`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await mobilePage.getByRole("heading", { name: "Knowledge Bank Extension" }).waitFor();
const extensionMobileVerified =
  (await mobilePage.getByRole("link", { name: "Open Knowledge Bank" }).isVisible()) &&
  (await mobilePage.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth));
await capture(mobilePage, "extension-mobile.png");
await mobilePage.close();

report.extensionDocsVerified = extensionDocsVerified;
report.extensionScrollSpyVerified = extensionScrollSpyVerified;
report.extensionMobileVerified = extensionMobileVerified;
console.log(JSON.stringify(report, null, 2));

if (
  pageErrors.length ||
  consoleErrors.length ||
  !report.dashboardVisible ||
  !report.bootScreenMinimal ||
  !report.themeTokensVerified ||
  !report.netronMapVerified ||
  !report.selectedNodeAccessible ||
  !report.brandAssetVerified ||
  !report.headingCapitalizationApplied ||
  !report.navigationIconBordersVerified ||
  !report.panelIconsWhiteVerified ||
  !report.graphControlsAligned ||
  !report.zoomControlBordersVerified ||
  !report.canvasHeadingRemoved ||
  !report.contextBankHeaderVerified ||
  !report.canvasZoomVerified ||
  !report.progressiveZoomVerified ||
  !report.canvasPanVerified ||
  !report.neighborhoodVerified ||
  !report.openSpaceResetVerified ||
  !report.shortestPathVerified ||
  !report.rendererSwitchVerified ||
  report.humanKnowledgeMutationControls > 0 ||
  !report.extensionDocsVerified ||
  !report.extensionScrollSpyVerified ||
  !report.extensionMobileVerified
) {
  process.exitCode = 1;
}
} finally {
  await browser.close();
}
