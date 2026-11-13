import { saveRuntimeSender, loadRuntimeSender } from './runtime-settings';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { senderCredentialsSchema } from './credentials';
export function senderStatus(){loadRuntimeSender();return {senderName:process.env.CTX_SENDER_NAME??'Dylan (ASP Private Capital)',email:process.env.GMAIL_USER??'',hasPassword:Boolean(process.env.GMAIL_APP_PASSWORD),liveDelivery:process.env.CTX_LIVE_EMAIL_DISPATCH==='true'};}
export async function saveSenderConfig(raw:unknown,liveDelivery:boolean,filename=path.join(process.cwd(),'.env.local')){
  const input=senderCredentialsSchema.parse(raw);
  if(/[\r\n]/.test(input.senderName))throw new Error('Invalid sender name');
  if(filename===path.join(process.cwd(),'.env.local')&&saveRuntimeSender({GMAIL_USER:input.email,GMAIL_APP_PASSWORD:input.password,CTX_SENDER_NAME:input.senderName,CTX_LIVE_EMAIL_DISPATCH:String(liveDelivery)}))return;
  const lock=await fs.open(`${filename}.sender-lock`,'wx',0o600);
  const temporary=`${filename}.${randomUUID()}.tmp`;
  try{
    let content='';
    try{const stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Environment file must be a regular file');content=await fs.readFile(filename,'utf8');}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
    const values={GMAIL_USER:input.email,GMAIL_APP_PASSWORD:input.password,CTX_SENDER_NAME:input.senderName,CTX_LIVE_EMAIL_DISPATCH:String(liveDelivery)};
    const lines=content.split(/\r?\n/).filter(line=>!Object.keys(values).some(key=>new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line)));
    while(lines.at(-1)==='')lines.pop();
    for(const [key,value]of Object.entries(values))lines.push(`${key}=${JSON.stringify(value)}`);
    const file=await fs.open(temporary,'wx',0o600);try{await file.writeFile(lines.join('\n')+'\n');await file.sync();}finally{await file.close();}
    await fs.rename(temporary,filename);
    if(filename===path.join(process.cwd(),'.env.local'))Object.assign(process.env,values);
  }finally{await fs.unlink(temporary).catch(()=>{});await lock.close();await fs.unlink(`${filename}.sender-lock`);}
}
