import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { rollup, type ArchitectureArea, type ArchitectureCommit, type ArchitectureDraft, type ArchitectureFile, type ArchitectureNode } from "@/lib/architecture/types";

const exec = promisify(execFile);
const MAX_BYTES = 512 * 1024;
export class ArchitectureError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
interface Source { id: string; name: string; area: ArchitectureArea; root: string; relative: string }
export function architectureRepository(appRoot = process.cwd(), workspaceRoot = process.env.CTX_WORKSPACE_ROOT ?? path.resolve(appRoot, "../..")) {
  const sources: Source[] = [
    { id: "agents/scripts", name: "Agent scripts", area: "agents", root: appRoot, relative: "scripts" },
    { id: "rag/ingestion", name: "Ingestion", area: "rag", root: appRoot, relative: "src/lib/server/document-repository.ts" },
    { id: "rag/mcp", name: "MCP servers", area: "rag", root: appRoot, relative: "mcp" },
    { id: "agents/runtime", name: "Agent runtime", area: "agents", root: appRoot, relative: "src/lib/server/outreach" },
    { id: "agents/api", name: "Agents API", area: "agents", root: appRoot, relative: "src/app/api/agents" },
    { id: "agents/guide", name: "Agent guide.md", area: "agents", root: appRoot, relative: "docs/outreach-agents.md" },
    { id: "rag/pipeline", name: "Data pipeline", area: "rag", root: workspaceRoot, relative: "RAG/tools" },
    { id: "rag/retrieval", name: "rag_agent.py", area: "rag", root: workspaceRoot, relative: "RAG/rag_agent.py" },
    { id: "rag/readme", name: "README.md", area: "rag", root: workspaceRoot, relative: "RAG/README.md" },
    { id: "rag/loader", name: "lead-corpus.ts", area: "rag", root: appRoot, relative: "src/lib/server/lead-corpus.ts" },
    { id: "rag/graph-mcp", name: "Graph MCP", area: "rag", root: appRoot, relative: "mcp/server.ts" },
    { id: "rag/restart-mcp", name: "Restart MCP", area: "rag", root: appRoot, relative: "mcp/restart-context-server.ts" },
  ];
  const draftsDir = path.join(appRoot, "data/architecture-drafts");
  async function resolve(id: string) {
    const source = sources.find(s => id === s.id || id.startsWith(`${s.id}/`));
    if (!source || id.includes("\\") || id.split("/").some(p => !p || p === "." || p === "..")) throw new ArchitectureError("Unknown architecture file", 404);
    const suffix = id.slice(source.id.length);
    const relative = source.relative + suffix;
    if (!/\.(ts|tsx|mjs|py|md|toml|css)$/.test(relative)) throw new ArchitectureError("Unsupported architecture file", 404);
    // Walk every segment: reject symlinks even if they happen to point inside the tree.
    let file = await realpath(source.root);
    for (const segment of relative.split("/")) {
      file = path.join(file, segment);
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new ArchitectureError("Linked files are unavailable", 403);
    }
    const info = await lstat(file);
    if (!info.isFile() || info.size > MAX_BYTES) throw new ArchitectureError("File cannot be opened in the editor", 413);
    return { file, source, relative, info };
  }
  async function commit(file: string): Promise<ArchitectureCommit | null> {
    try {
      const { stdout } = await exec("git", ["log", "-1", "--format=%H%x00%cI%x00%s", "--", path.basename(file)], { cwd: path.dirname(file), timeout: 3000, maxBuffer: 8192 });
      const [hash, date, subject] = stdout.trim().split("\0");
      return hash && date ? { hash, date: new Date(date).toISOString(), subject } : null;
    } catch { return null; }
  }
  async function walk(source: Source, suffix = ""): Promise<ArchitectureNode | null> {
    const file = path.join(source.root, source.relative + suffix);
    const info = await lstat(file);
    if (info.isSymbolicLink()) return null;
    const id = source.id + suffix;
    const name = suffix ? path.basename(suffix) : source.name;
    if (info.isDirectory()) {
      const children: ArchitectureNode[] = [];
      for (const entry of (await readdir(file)).sort()) {
        if (entry.startsWith(".") || entry === "__pycache__") continue;
        const child = await walk(source, `${suffix}/${entry}`);
        if (child) children.push(child);
      }
      return rollup({ id, name, area: source.area, kind: "folder", children, fileCount: 0, bytes: 0, modified: "", commit: null });
    }
    if (!info.isFile() || !/\.(ts|tsx|mjs|py|md|toml|css)$/.test(file)) return null;
    return { id, name, area: source.area, kind: "file", path: source.relative + suffix,
      fileCount: 1, bytes: info.size, modified: info.mtime.toISOString(), commit: await commit(file) };
  }
  async function readDraft(id: string): Promise<ArchitectureDraft | null> {
    try {
      const raw = await readFile(path.join(draftsDir, `${digest(id)}.json`), "utf8");
      return raw.trim() ? JSON.parse(raw) : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  }
  return {
    async tree() {
      const warnings: string[] = [];
      const nodes: ArchitectureNode[] = [];
      for (const source of sources) {
        try { const node = await walk(source); if (node) nodes.push(node); }
        catch { warnings.push(`${source.name} is unavailable in this checkout.`); }
      }
      return { nodes: (["agents", "rag"] as const).map(area => rollup({ id: area, area, name: area === "agents" ? "Agents" : "RAG", kind: "folder", children: nodes.filter(n => n.area === area), fileCount: 0, bytes: 0, modified: "", commit: null })), warnings };
    },
    async file(id: string): Promise<ArchitectureFile> {
      const { file, relative } = await resolve(id);
      const content = await readFile(file, "utf8");
      return { id, path: relative, content, hash: digest(content), draft: await readDraft(id) };
    },
    async saveDraft(id: string, content: string, baseHash: string, revision: string | null) {
      if (Buffer.byteLength(content) > MAX_BYTES) throw new ArchitectureError("Draft exceeds the editor size limit", 413);
      const { file } = await resolve(id);
      await mkdir(draftsDir, { recursive: true });
      const draftPath = path.join(draftsDir, `${digest(id)}.json`);
      const lockPath = `${draftPath}.lock`;
      const lock = await open(lockPath, "wx").catch(() => { throw new ArchitectureError("Another save is in progress. Retry shortly.", 409); });
      const temp = `${draftPath}.${randomUUID()}.tmp`;
      try {
        if (digest(await readFile(file, "utf8")) !== baseHash) throw new ArchitectureError("The source changed. Reload it and merge your edits before saving.", 409);
        const previous = await readDraft(id);
        if ((previous?.revision ?? null) !== revision) throw new ArchitectureError("A newer draft exists. Reload it before saving.", 409);
        const draft: ArchitectureDraft = { content, baseHash, revision: randomUUID(), savedAt: new Date().toISOString() };
        const handle = await open(temp, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify(draft));
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temp, draftPath);
        return draft;
      } finally { await unlink(temp).catch(() => {}); await lock.close(); await unlink(lockPath); }
    },
  };
}
