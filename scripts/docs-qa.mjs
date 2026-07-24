import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const [mcpSource, docsSource] = await Promise.all([
  fs.readFile(path.join(root, "mcp", "server.ts"), "utf8"),
  fs.readFile(path.join(root, "src", "content", "extension-docs.ts"), "utf8"),
]);
const registeredTools = [...mcpSource.matchAll(/registerTool\(\s*["']([^"']+)["']/g)]
  .map((match) => match[1])
  .sort();
const documentedTools = [...docsSource.matchAll(/\[\s*["']([a-z]+(?:_[a-z]+)+)["']\s*,/g)]
  .map((match) => match[1])
  .filter((name) => registeredTools.includes(name))
  .sort();

if (JSON.stringify(registeredTools) !== JSON.stringify(documentedTools)) {
  throw new Error(
    [
      "The /extension MCP reference does not match mcp/server.ts.",
      `Registered: ${registeredTools.join(", ")}`,
      `Documented: ${documentedTools.join(", ")}`,
    ].join("\n"),
  );
}

const requiredLocations = [
  "src/app/extension/page.tsx",
  "src/app/extension/page.module.css",
  "src/content/extension-docs.ts",
];
await Promise.all(requiredLocations.map((location) => fs.access(path.join(root, location))));

console.log(
  JSON.stringify(
    {
      route: "/extension",
      documentedMcpTools: documentedTools.length,
      graphModelValuesImportedFromSource: docsSource.includes("NODE_TYPES") && docsSource.includes("EDGE_TYPES"),
      editableContentSource: "src/content/extension-docs.ts",
    },
    null,
    2,
  ),
);
