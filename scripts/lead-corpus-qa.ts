import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve("../../RAG/corpus/chunks/normalized-contacts");
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ctx-corpus-qa-"));
process.env.CTX_LEAD_CORPUS_PATH = fixtureRoot;
const { loadLeadGraph } = await import("../src/lib/server/lead-corpus");
const segments = (await fs.readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const files = (await Promise.all(segments.map(async (segment) =>
  (await fs.readdir(path.join(root, segment))).filter((file) => file.endsWith(".md")).map((file) => path.join(segment, file)),
))).flat();
for (const segment of new Set(files.map((file) => path.dirname(file)))) await fs.mkdir(path.join(fixtureRoot, segment));
await Promise.all(files.map((file) => fs.copyFile(path.join(root, file), path.join(fixtureRoot, file))));
const initial = await loadLeadGraph();
const leads = initial.nodes.filter((node) => node.id.startsWith("lead-"));
assert.equal(leads.length, 949);
assert.equal(new Set(leads.map((node) => node.id)).size, 949);
assert.equal(new Set(leads.map((node) => node.sources[0].path)).size, files.length);
const csv = await fs.readFile("../../RAG/validation-summary/database/phase1_email_optimized_leadbase.csv", "utf8");
// Track quoted CSV fields so multiline summaries cannot manufacture record IDs.
const rows: string[][] = [];
let row: string[] = [], value = "", quoted = false;
for (let i = 0; i < csv.length; i++) {
  const char = csv[i];
  if (char === '"') {
    if (quoted && csv[i + 1] === '"') { value += '"'; i++; }
    else quoted = !quoted;
  } else if (char === "," && !quoted) { row.push(value); value = ""; }
  else if (char === "\n" && !quoted) { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
  else value += char;
}
if (value || row.length) { row.push(value); rows.push(row); }
const csvIds = rows.slice(1).map((record) => `lead-${record[0]}`).sort();
assert.deepEqual(leads.map((node) => node.id).sort(), csvIds);
const unchanged = await loadLeadGraph();
assert.equal(unchanged.generatedAt, initial.generatedAt);
const file = path.join(fixtureRoot, files[0]);
const original = await fs.readFile(file, "utf8");
await fs.writeFile(file, `${original}\n\n## Local sync check\nA new local observation.\n`);
const edited = await loadLeadGraph();
assert.notEqual(edited.generatedAt, initial.generatedAt);
assert.ok(edited.nodes.some((node) => node.sources[0]?.excerpt?.includes("A new local observation.")));
await fs.rename(file, `${file}.removed`);
assert.equal((await loadLeadGraph()).nodes.filter((node) => node.id.startsWith("lead-")).length, 948);
await fs.rename(`${file}.removed`, file);
assert.equal((await loadLeadGraph()).nodes.filter((node) => node.id.startsWith("lead-")).length, 949);
console.log(JSON.stringify({ leads: leads.length, sourceCoverage: files.length, cacheStable: true, update: true, removal: true, restoration: true, fixtureRoot }));
