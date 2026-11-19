import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, copyFile, chmod, lstat, realpath, rm, open } from 'node:fs/promises';
import path from 'node:path';
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const contains = (parent, child) => child === parent || child.startsWith(parent + path.sep);
async function isDatabase(file) {
  let handle;
  try {
    handle = await open(file, 'r');
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, 16, 0);
    return bytesRead === 16 && header.toString('binary') === 'SQLite format 3\0';
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  } finally { await handle?.close(); }
}
function checkDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok')) throw new Error('SQLite integrity check failed.');
  } finally { db.close(); }
}
async function newDestination(destination) {
  return path.join(await realpath(path.dirname(path.resolve(destination))), path.basename(destination));
}
// Stop every writer for a consistent snapshot across databases and files.
export async function createBackup({ data, config, destination, writersStopped }) {
  if (!writersStopped) throw new Error('Stop all data/configuration writers before backup.');
  const roots = { data: await realpath(data), ...(config ? { config: await realpath(config) } : {}) };
  destination = await newDestination(destination);
  for (const root of Object.values(roots)) {
    if (contains(root, destination) || contains(destination, root)) throw new Error('Backup and source paths must not overlap.');
    if (!(await lstat(root)).isDirectory()) throw new Error('Source must be a directory.');
  }
  await mkdir(destination, { mode: 0o700 });
  const manifest = { version: 1, createdAt: new Date().toISOString(), roots: Object.keys(roots), files: [] };
  try {
    for (const [name, root] of Object.entries(roots)) {
      async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const input = path.join(directory, entry.name);
          if (entry.isSymbolicLink()) throw new Error('Source contains a symbolic link; backup aborted.');
          if (entry.isDirectory()) { await visit(input); continue; }
          if (!entry.isFile()) throw new Error('Source contains an unsupported file.');
          const sidecar = input.replace(/-(?:wal|shm|journal)$/, '');
          if (sidecar !== input && await isDatabase(sidecar)) continue;
          const relative = path.relative(root, input);
          const output = path.join(destination, name, relative);
          await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
          const sqlite = await isDatabase(input);
          if (sqlite) {
            const db = new DatabaseSync(input, { readOnly: true });
            try { await backup(db, output); } finally { db.close(); }
            checkDatabase(output);
          } else await copyFile(input, output);
          await chmod(output, 0o600);
          manifest.files.push({ root: name, path: relative, sqlite, sha256: await digest(output) });
        }
      }
      await visit(root);
    }
    await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return manifest;
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}
export async function restoreBackup({ source, destination }) {
  source = await realpath(source);
  destination = await newDestination(destination);
  if (contains(source, destination) || contains(destination, source)) throw new Error('Restore paths must not overlap.');
  const manifestPath = path.join(source, 'manifest.json');
  if ((await lstat(manifestPath)).isSymbolicLink()) throw new Error('Invalid manifest file.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !Array.isArray(manifest.roots) ||
      !manifest.roots.includes('data') || new Set(manifest.roots).size !== manifest.roots.length ||
      manifest.roots.some(root => !['data', 'config'].includes(root))) throw new Error('Invalid backup manifest.');
  const seen = new Set();
  for (const file of manifest.files) {
    if (!file || !manifest.roots.includes(file.root) || typeof file.path !== 'string' || !file.path ||
        path.isAbsolute(file.path) || file.path.includes('\\') || file.path.split('/').some(part => part === '..' || part === '.' || !part) ||
        typeof file.sqlite !== 'boolean' || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid backup entry.');
    const key = `${file.root}/${file.path}`;
    if (seen.has(key)) throw new Error('Duplicate backup entry.');
    seen.add(key);
    let cursor = source;
    for (const part of [file.root, ...file.path.split('/')]) {
      cursor = path.join(cursor, part);
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Backup contains a symbolic link.');
    }
    if (!(await lstat(cursor)).isFile()) throw new Error('Backup entry is not a file.');
    if (await digest(cursor) !== file.sha256) throw new Error('Backup checksum mismatch.');
    if (file.sqlite) checkDatabase(cursor);
  }
  // Never overwrite a live instance. Validate everything before creating staging.
  await mkdir(destination, { mode: 0o700 });
  try {
    for (const root of manifest.roots) await mkdir(path.join(destination, root), { mode: 0o700 });
    for (const file of manifest.files) {
      const output = path.join(destination, file.root, file.path);
      await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      await copyFile(path.join(source, file.root, file.path), output);
      await chmod(output, 0o600);
    }
    return { restored: manifest.files.length, roots: manifest.roots };
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}
