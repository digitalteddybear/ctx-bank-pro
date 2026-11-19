import { restoreBackup } from './data-recovery.mjs';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node scripts/restore-data.mjs BACKUP NEW_STAGING_DIRECTORY');
console.log(JSON.stringify(await restoreBackup({ source, destination })));
