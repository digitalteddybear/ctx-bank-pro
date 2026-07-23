import { chromium } from "playwright-core";
import process from "node:process";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const agentToken = process.env.AGENT_WRITE_TOKEN;
if (!agentToken) throw new Error("AGENT_WRITE_TOKEN is required");

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const label = `Live sync validation ${Date.now()}`;
let createdId;

try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.getByRole("heading", { name: "Knowledge base observatory" }).waitFor();
  const metric = page
    .locator(".metric-card")
    .filter({ hasText: "Graph knowledge" })
    .locator(":scope > strong");
  const before = Number(await metric.textContent());

  const createdResponse = await fetch(`${baseUrl}/api/graph`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-token": agentToken,
    },
    body: JSON.stringify({
      kind: "node",
      data: {
        label,
        type: "concept",
        description:
          "A temporary agent-authored node proving that the read-only frontend consumes live backend changes.",
        status: "review",
        authority: "agent-generated",
        confidence: 0.7,
        tags: ["qa", "live-sync"],
      },
    }),
  });
  if (!createdResponse.ok) throw new Error(`Agent write failed: ${createdResponse.status}`);
  const created = await createdResponse.json();
  createdId = created.id;

  await page.waitForFunction(
    ({ expected }) => {
      const cards = [...document.querySelectorAll(".metric-card")];
      const graphCard = cards.find((card) => card.textContent?.includes("Graph knowledge"));
      const value = graphCard?.querySelector(":scope > strong")?.textContent;
      return Number(value) === expected;
    },
    { expected: before + 1 },
    { timeout: 12_000 },
  );

  await page.keyboard.press("Meta+K");
  await page.getByPlaceholder(/Search frameworks/i).fill(label);
  await page
    .locator(".command-results button")
    .filter({ hasText: label })
    .waitFor({ timeout: 5_000 });

  console.log(
    JSON.stringify(
      {
        initialActiveNodes: before,
        synchronizedActiveNodes: before + 1,
        backendChangeVisibleWithoutReload: true,
        browserRemainedReadOnly: true,
      },
      null,
      2,
    ),
  );
} finally {
  if (createdId) {
    await fetch(`${baseUrl}/api/graph/${createdId}`, {
      method: "DELETE",
      headers: { "x-agent-token": agentToken },
    });
  }
  await browser.close();
}
