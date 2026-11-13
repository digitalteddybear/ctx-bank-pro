import { spawnSync } from 'node:child_process';
const result=spawnSync(process.execPath,['--import','tsx','--test','scripts/campaign-batch-qa.ts'],{stdio:'inherit',env:{...process.env,NODE_ENV:'test'}});
process.exit(result.status??1);
