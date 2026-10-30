import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:3005";
const graph = await fetch(`${base}/api/graph`).then((response) => response.json());
const leads = graph.nodes.filter((node) => node.id.startsWith("lead-"));
console.log("Loaded graph", leads.length);
assert.equal(leads.length, 949);
assert.equal(new Set(leads.map((node) => node.id)).size, 949);
assert.ok(!JSON.stringify(graph).includes("World Creators"));
assert.equal(leads.find((node) => node.tags.includes("ph1@mrc-lmb.cam.ac.uk"))?.label, "Dr Philipp Holliger");
for (const lead of leads) {
  assert.ok(lead.label);
  assert.ok(lead.description.startsWith(`${lead.label} is an ASP Private Capital prospect retained after Phase 1 validation.`));
  assert.ok(!lead.description.includes("```"));
  assert.ok(lead.sources[0].path.endsWith(".md"));
  assert.ok(lead.sources[0].excerpt.includes("## Executive Context Summary"));
  assert.ok(graph.links.some((link) => link.target === lead.id));
}
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-background-networking"],
});
console.log("Browser started");
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const failedAssets = [];
  page.on("response", (response) => {
    if (response.url().includes("/_next/") && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("Page loaded");
  await page.locator(".boot-sequence").waitFor({ state: "hidden", timeout: 20000 });
  assert.ok(await page.evaluate(() => [...document.styleSheets].some(sheet => {
    try { return [...sheet.cssRules].some(rule => rule.cssText.includes("astryx")); } catch { return false; }
  })), "Astryx stylesheet must be loaded");
  await page.getByRole("button", { name: "Open Knowledge Bank", exact: true }).click();
  console.log("Graph opened");
  assert.equal(await page.getByRole("radio", { name: "3D graph", exact: true }).getAttribute("aria-checked"), "true");
  await page.getByRole("radio", { name: "2D map", exact: true }).click();
  await page.getByText("Corporate prospects", { exact: true }).waitFor();
  const board = page.getByTestId("lead-columns-board");
  assert.equal(await board.locator(".astryx-list-item").count(), 949);
  const boardBeforeSidebar = await board.boundingBox();
  const corporateBeforeSidebar = await page.locator('[data-lead-column="B2B_CORPORATE"]').boundingBox();
  assert.ok(boardBeforeSidebar && Math.abs(boardBeforeSidebar.x) < 1 && Math.abs(boardBeforeSidebar.width - 1600) < 2);
  assert.ok(corporateBeforeSidebar && corporateBeforeSidebar.x >= 5);
  assert.equal(await page.locator('[data-lead-column="B2B_CORPORATE"]').evaluate((element) => getComputedStyle(element).borderRadius), "12px");
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await page.waitForTimeout(300);
  const boardWithSidebar = await board.boundingBox();
  const corporateWithSidebar = await page.locator('[data-lead-column="B2B_CORPORATE"]').boundingBox();
  assert.ok(boardWithSidebar && boardWithSidebar.x > 200 && Math.abs(boardWithSidebar.x + boardWithSidebar.width - 1600) < 2);
  assert.ok(corporateBeforeSidebar && corporateWithSidebar && corporateWithSidebar.width < corporateBeforeSidebar.width);
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await page.waitForTimeout(300);
  const columnScrollers = page.locator('[class*="scroller"]');
  assert.equal(await columnScrollers.count(), 4);
  assert.ok(await columnScrollers.first().evaluate((element) => element.scrollHeight > element.clientHeight));
  await page.getByRole("button", { name: /Search nodes/ }).click();
  await page.getByPlaceholder("Search nodes, descriptions, tags, and views…").fill("martin@paramounttradesandlabour.com");
  await page.getByRole("option").filter({ hasText: "Martin Campbell" }).first().click();
  await page.locator(".inspector h2").filter({ hasText: "Martin Campbell" }).waitFor();
  await page.waitForTimeout(300);
  await page.locator(".astryx-list-item[aria-selected=true]").waitFor();
  const inspectorText = await page.locator(".inspector").innerText();
  assert.ok(inspectorText.includes("Validation summary"));
  assert.ok(inspectorText.includes("Contact and CRM record"));
  assert.ok(inspectorText.includes("Email validation"));
  assert.ok(inspectorText.includes("Phone validation"));
  assert.ok(inspectorText.includes("Classification and context"));
  assert.ok(inspectorText.includes("Source and provenance"));
  assert.ok(inspectorText.includes("SMTP connection timeout"));
  assert.ok(!inspectorText.includes("_"));
  assert.equal(await page.locator(".inspector__node-mark").count(), 0);
  const descriptionBox = await page.locator("#prospect-description").boundingBox();
  const descriptionBottom = descriptionBox ? descriptionBox.y + descriptionBox.height : 0;
  const validationTop = (await page.locator("#prospect-validation").boundingBox())?.y ?? 0;
  assert.ok(validationTop >= descriptionBottom);
  await page.screenshot({ path: "/tmp/asp-invest-spatial.png" });
  await page.getByRole("radio", { name: "2D map" }).click();
  await page.getByText("Corporate prospects", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await board.getByText("Martin Campbell", { exact: true }).click();
  await page.locator(".inspector h2").filter({ hasText: "Martin Campbell" }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/asp-invest-2d.png" });
  await page.locator(".inspector__scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.getByRole("button", { name: /Search nodes/ }).click();
  const nextLead = leads.find((node) => node.id !== "lead-52964935274");
  const nextEmail = nextLead.tags.find((tag) => tag.includes("@"));
  await page.getByPlaceholder("Search nodes, descriptions, tags, and views…").fill(nextEmail);
  await page.getByRole("option").filter({ hasText: nextLead.label }).first().click();
  await page.locator(".inspector h2").filter({ hasText: nextLead.label }).waitFor();
  assert.equal(await page.locator(".inspector__scroll").evaluate((element) => element.scrollTop), 0);
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("radio", { name: "3D graph", exact: true }).click();
  await page.locator(".neural-graph--orbital canvas").waitFor();
  await page.getByRole("button", { name: "Return to graph", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForTimeout(400);
  const persistedView = await page.evaluate(() => sessionStorage.getItem("ctxbankpro:neural-graph-view"));
  assert.ok(persistedView, "Graph pan and zoom state is persisted");
  await page.screenshot({ path: "/tmp/asp-invest-orbital-light.png" });
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({ path: "/tmp/asp-invest-orbital-dark.png" });
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  await page.getByRole("radio", { name: "2D map", exact: true }).click();
  await page.getByRole("radio", { name: "3D graph", exact: true }).click();
  assert.equal(await page.evaluate(() => sessionStorage.getItem("ctxbankpro:neural-graph-view")), persistedView);
  await page.getByRole("radio", { name: "2D map", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await board.waitFor({ state: "visible" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/asp-invest-mobile.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  assert.deepEqual(failedAssets, [], "All live CSS, font and JavaScript assets must load");
  console.log(JSON.stringify({ leads: leads.length, nodes: graph.nodes.length, browserErrors: errors, screenshots: "/tmp/asp-invest-*.png" }));
} finally {
  await browser.close();
}
