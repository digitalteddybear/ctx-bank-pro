import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { architectureRepository } from "../src/lib/server/architecture";
import { filterArchitecture, rollup, type ArchitectureNode } from "../src/lib/architecture/types";

test("architecture drafts preserve source, detect stale writes, and reject filesystem escapes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ctx-architecture-"));
  const app = path.join(root, "App/knowledge-network");
  const folder = path.join(app, "src/lib/server/outreach");
  await mkdir(folder, { recursive: true });
  const source = path.join(folder, "engine.ts");
  await writeFile(source, "export const stage = 'research';\n");
  const repo = architectureRepository(app, root);
  try {
    const file = await repo.file("agents/runtime/engine.ts");
    const draft = await repo.saveDraft(file.id, "proposed change", file.hash, null);
    assert.equal(await readFile(source, "utf8"), file.content);
    assert.equal((await repo.file(file.id)).draft?.content, "proposed change");
    await assert.rejects(repo.saveDraft(file.id, "lost update", file.hash, null), /newer draft/);
    await writeFile(source, "changed outside CTX");
    await assert.rejects(repo.saveDraft(file.id, "stale source", file.hash, draft.revision), /source changed/);
    await assert.rejects(repo.file("agents/runtime/../../../../package.json"), /Unknown architecture/);
    await assert.rejects(repo.file("rag/readme/../secrets.md"), /Unknown architecture/);
    await symlink(source, path.join(folder, "linked.ts"));
    await assert.rejects(repo.file("agents/runtime/linked.ts"), /Linked files/);
    await assert.rejects(repo.file("agents/runtime/.env"), /Unsupported architecture/);
    const tree = await repo.tree();
    assert.equal(tree.nodes[0].fileCount, 1);
    assert.ok(tree.warnings.length > 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("filtered folders roll up counts and complete newest commits from surviving children", () => {
  const leaf = (id: string, date: string): ArchitectureNode => ({ id, name: id, kind: "file", area: "agents", fileCount: 1, bytes: 10, modified: date, commit: { hash: id, date, subject: id } });
  const parent = rollup({ ...leaf("root", ""), kind: "folder", children: [leaf("old.ts", "2026-01-01"), leaf("new.ts", "2026-02-01")] });
  assert.equal(parent.fileCount, 2); assert.equal(parent.commit?.hash, "new.ts");
  const filtered = filterArchitecture([parent], "old.ts")[0];
  assert.equal(filtered.fileCount, 1); assert.equal(filtered.bytes, 10); assert.equal(filtered.commit?.subject, "old.ts");
});
