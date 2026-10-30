import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { buildOrbitalLayout } from "../src/lib/graph/orbital-layout";

const base = "http://127.0.0.1:3005";
const graph = await fetch(`${base}/api/graph`).then(response => response.json());
const layout = buildOrbitalLayout(graph);
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: "dark" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const originalStroke = CanvasRenderingContext2D.prototype.stroke;
    const originalTransform = CanvasRenderingContext2D.prototype.setTransform;
    CanvasRenderingContext2D.prototype.setTransform = function (...args: unknown[]) {
      this.canvas.dataset.focusStrokes = "0";
      return Reflect.apply(originalTransform, this, args);
    };
    CanvasRenderingContext2D.prototype.stroke = function (...args: unknown[]) {
      if (this.strokeStyle === "#818cf8" && this.globalAlpha === 1) this.canvas.dataset.focusStrokes = String(Number(this.canvas.dataset.focusStrokes ?? 0) + 1);
      return Reflect.apply(originalStroke, this, args);
    };
  });
  await page.goto(base);
  await page.locator(".boot-sequence").waitFor({ state: "hidden" });
  const backgroundMatches = () => page.locator(".neural-graph canvas").evaluate(canvas => {
    const probe = document.createElement("canvas");
    const context = probe.getContext("2d")!;
    context.fillStyle = document.documentElement.dataset.theme === "dark" ? (canvas.closest(".network-preview") ? "#262626" : "#171717") : "#ffffff";
    context.fillRect(0, 0, 1, 1);
    return String((canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0,0,1,1).data) === String(context.getImageData(0,0,1,1).data);
  });
  assert.ok(await backgroundMatches(), "Dashboard preview is carbon grey");
  assert.equal(await page.locator(".app-shell").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(23, 23, 23)", "Existing dark page palette is preserved");
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  await page.waitForTimeout(200);
  assert.ok(await backgroundMatches(), "Dashboard preview is white in light mode");
  assert.equal(await page.locator(".app-shell").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(247, 248, 250)", "Existing light page palette is preserved");
  await page.screenshot({ path: "/tmp/graph-preview-white.png" });
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/graph-preview-carbon.png" });
  await page.getByRole("button", { name: "Open Knowledge Bank", exact: true }).click();
  assert.equal(await page.getByRole("radio", { name: "3D graph", exact: true }).getAttribute("aria-checked"), "true", "Dashboard opens the 3D graph by default");
  await page.getByRole("radio", { name: "3D graph", exact: true }).click();
  const canvas = page.locator(".neural-graph canvas");
  await canvas.waitFor();
  await page.waitForTimeout(300);
  assert.ok(await backgroundMatches(), "Full graph background matches the dark app background");
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  await page.waitForTimeout(200);
  assert.ok(await backgroundMatches(), "Full graph is white in light mode");
  await page.screenshot({ path: "/tmp/graph-white.png" });
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(200);
  for (const tier of [2,3,4]) {
    await page.getByRole("button", { name: "Return to graph", exact: true }).click();
    await page.waitForTimeout(400);
    const view = await page.evaluate(() => JSON.parse(sessionStorage.getItem("ctxbankpro:neural-graph-view")!));
    const box = (await canvas.boundingBox())!;
    const node = layout.nodes.find(node => node.tier === tier && node.x < -50 && node.members.length > 2)!;
    assert.ok(node);
    await page.mouse.click(box.x + view.x + node.x * view.scale, box.y + view.y + node.y * view.scale);
    await page.waitForTimeout(400);
    await page.mouse.move(300, 30);
    await page.waitForTimeout(100);
    const pinned = Number(await canvas.getAttribute("data-focus-strokes"));
    assert.ok(pinned > 5, `Tier ${tier} cohort remains highlighted after pointer leaves`);
    await page.mouse.move(box.x + view.x, box.y + view.y);
    await page.waitForTimeout(100);
    assert.equal(Number(await canvas.getAttribute("data-focus-strokes")), pinned, "Hovering another node does not replace clicked cohort");
    await page.mouse.click(box.x + 20, box.y + 150);
    await page.mouse.move(300, 30);
    await page.waitForTimeout(300);
    assert.equal(Number(await canvas.getAttribute("data-focus-strokes")), 0, "Clicking empty canvas clears selection");
  }
  await page.screenshot({ path: "/tmp/cohort-qa.png" });
  assert.deepEqual(errors, []);
  console.log("Full graph uses app black; preview retains carbon grey; light views stay white; cohort selection passes; no browser errors.");
} finally { await browser.close(); }
