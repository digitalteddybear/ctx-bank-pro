import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const corpusRoot = path.resolve(appRoot, "..");
const outputDirectory = path.join(appRoot, "data", "generated");
const outputPath = path.join(outputDirectory, "source-manifest.json");

const sourceRoots = [
  path.join(corpusRoot, "context"),
  path.join(corpusRoot, "all-other-files"),
  path.join(corpusRoot, "world_creators_business_architecture.md"),
];

const supported = new Set([
  ".md",
  ".txt",
  ".rtf",
  ".csv",
  ".html",
  ".docx",
  ".pdf",
]);

interface SourceManifestItem {
  id: string;
  relativePath: string;
  extension: string;
  size: number;
  modifiedAt: string;
  sha256: string;
  textual: boolean;
  preview?: string;
}

async function collect(target: string): Promise<string[]> {
  const stat = await fs.stat(target);
  if (stat.isFile()) return [target];
  const entries = await fs.readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => collect(path.join(target, entry.name))),
  );
  return nested.flat();
}

function normalizePreview(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[{}\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

async function inspect(filePath: string): Promise<SourceManifestItem> {
  const content = await fs.readFile(filePath);
  const stat = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const textual = [".md", ".txt", ".rtf", ".csv", ".html"].includes(extension);
  const relativePath = path.relative(corpusRoot, filePath);
  const digest = createHash("sha256").update(content).digest("hex");

  return {
    id: `source-${digest.slice(0, 16)}`,
    relativePath,
    extension,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: digest,
    textual,
    preview: textual ? normalizePreview(content.toString("utf8")) : undefined,
  };
}

async function main() {
  const existingRoots: string[] = [];
  for (const sourceRoot of sourceRoots) {
    try {
      await fs.access(sourceRoot);
      existingRoots.push(sourceRoot);
    } catch {
      console.warn(`Skipped missing source root: ${sourceRoot}`);
    }
  }

  const files = (await Promise.all(existingRoots.map(collect)))
    .flat()
    .filter((filePath) => supported.has(path.extname(filePath).toLowerCase()))
    .sort();
  const sources = await Promise.all(files.map(inspect));
  const byExtension = sources.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.extension] = (accumulator[item.extension] ?? 0) + 1;
    return accumulator;
  }, {});

  const manifest = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    corpusRoot,
    sourceCount: sources.length,
    textualCount: sources.filter((item) => item.textual).length,
    totalBytes: sources.reduce((sum, item) => sum + item.size, 0),
    byExtension,
    sources,
  };

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Indexed ${sources.length} source assets into ${outputPath}`);
  console.log(JSON.stringify(byExtension, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
