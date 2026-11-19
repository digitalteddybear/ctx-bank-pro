import path from 'node:path';
import { createBackup } from './data-recovery.mjs';
const destination = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? path.join('/backups', new Date().toISOString().replace(/[:.]/g, '-'));
const manifest = await createBackup({ data: process.env.CTX_DATA_DIR ?? '/data', config: process.env.CTX_CONFIG_DIR, destination, writersStopped: process.argv.includes('--writers-stopped') });
console.log(JSON.stringify({ backup: path.resolve(destination), files: manifest.files.length, roots: manifest.roots }));
