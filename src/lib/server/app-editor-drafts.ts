import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 512 * 1024;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export class AppEditorDraftError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
export type AppEditorDraft = { path: string; content: string; baseHash: string; revision: string | null; savedAt: string | null };

function safeRelativePath(input: string) {
  const normalized = input.replace(/\\/g, "/").replace(/^src\//, "");
  if (!/^(components|app|content)\/[a-zA-Z0-9._/-]+\.(tsx?|jsx?|css|md)$/.test(normalized) || normalized.split("/").some(segment => !segment || segment === "." || segment === "..")) throw new AppEditorDraftError("App Editor supports source files under src/components, non-API src/app routes, and src/content.", 400);
  if (normalized.startsWith("app/api/")) throw new AppEditorDraftError("API routes are not available in the App Editor.", 403);
  return normalized;
}

export function appEditorDraftRepository(appRoot = process.cwd()) {
  const draftsDir = path.join(appRoot, "data/generated/ai-workspace/app-drafts");
  async function resolve(relative: string) {
    const root = await realpath(appRoot);
    let file = root;
    for (const part of ["src", ...relative.split("/")]) {
      file = path.join(file, part);
      const info = await lstat(file).catch(() => null);
      if (!info) throw new AppEditorDraftError("App source file not found.", 404);
      if (info.isSymbolicLink()) throw new AppEditorDraftError("Linked files are unavailable in the App Editor.", 403);
    }
    const info = await lstat(file);
    if (!info.isFile() || info.size > MAX_BYTES) throw new AppEditorDraftError("App source file exceeds the editor size limit.", 413);
    return file;
  }
  async function readDraft(relative: string): Promise<{ content: string; baseHash: string; revision: string; savedAt: string } | null> {
    try { return JSON.parse(await readFile(path.join(draftsDir, `${digest(relative)}.json`), "utf8")) as { content: string; baseHash: string; revision: string; savedAt: string }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  return {
    async read(input: string): Promise<AppEditorDraft> {
      const relative = safeRelativePath(input); const file = await resolve(relative); const content = await readFile(file, "utf8"); const draft = await readDraft(relative);
      return { path: `src/${relative}`, content: draft?.content ?? content, baseHash: digest(content), revision: draft?.revision ?? null, savedAt: draft?.savedAt ?? null };
    },
    async save(input: string, content: string, baseHash: string, revision: string | null) {
      const relative = safeRelativePath(input); if (Buffer.byteLength(content) > MAX_BYTES) throw new AppEditorDraftError("Draft exceeds the 512 KB limit.", 413);
      const file = await resolve(relative); if (digest(await readFile(file, "utf8")) !== baseHash) throw new AppEditorDraftError("The source changed. Reload and review before saving.", 409);
      await mkdir(draftsDir, { recursive: true, mode: 0o700 });
      const draftPath = path.join(draftsDir, `${digest(relative)}.json`); const lockPath = `${draftPath}.lock`;
      const lock = await open(lockPath, "wx", 0o600).catch(() => { throw new AppEditorDraftError("Another save is in progress. Retry shortly.", 409); });
      const temp = `${draftPath}.${randomUUID()}.tmp`;
      try {
        const previous = await readDraft(relative);
        if ((previous?.revision ?? null) !== revision) throw new AppEditorDraftError("A newer draft exists. Reload it before saving.", 409);
        const saved = { content, baseHash, revision: randomUUID(), savedAt: new Date().toISOString() };
        const output = await open(temp, "wx", 0o600); try { await output.writeFile(JSON.stringify(saved)); await output.sync(); } finally { await output.close(); }
        await rename(temp, draftPath); return { path: `src/${relative}`, ...saved };
      } finally { await unlink(temp).catch(() => {}); await lock.close(); await unlink(lockPath).catch(() => {}); }
    },
  };
}
