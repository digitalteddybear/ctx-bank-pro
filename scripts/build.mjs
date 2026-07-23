import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const build = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vinext", "build"],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const sourceManifest = path.join(root, ".openai", "hosting.json");
const artifactDirectory = path.join(root, "dist", ".openai");
const artifactManifest = path.join(artifactDirectory, "hosting.json");

await fs.mkdir(artifactDirectory, { recursive: true });
await fs.copyFile(sourceManifest, artifactManifest);
console.log("Packaged Sites hosting manifest in dist/.openai/hosting.json");
