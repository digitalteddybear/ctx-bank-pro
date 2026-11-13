import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { outreachStore } from "./store-instance";

function key(): Buffer | null {
  const local=path.join(process.cwd(),"deploy/secrets/settings-key");
  const file=process.env.CTX_SETTINGS_KEY_FILE??(existsSync(local)?local:undefined);
  const raw=(file?readFileSync(file,"utf8"):process.env.CTX_SETTINGS_KEY??"").trim();
  if(!raw)return null;
  if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error("CTX_SETTINGS_KEY must be 32 bytes encoded as hexadecimal.");
  return Buffer.from(raw,"hex");
}
export function saveRuntimeSender(values: Record<string,string>) {
  const encryptionKey=key();
  if(!encryptionKey)return false;
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey,iv);
  const content=Buffer.concat([cipher.update(JSON.stringify(values),"utf8"),cipher.final()]);
  outreachStore().setSetting("encrypted-sender",JSON.stringify({iv:iv.toString("hex"),tag:cipher.getAuthTag().toString("hex"),content:content.toString("hex")}));
  Object.assign(process.env,values);
  return true;
}
export function loadRuntimeSender() {
  const raw=outreachStore().setting("encrypted-sender");
  if(!raw)return "";
  const encryptionKey=key();
  if(!encryptionKey)throw new Error("Saved sender credentials require CTX_SETTINGS_KEY.");
  const {iv,tag,content}=JSON.parse(String(raw)) as {iv:string;tag:string;content:string};
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey,Buffer.from(iv,"hex"));
  decipher.setAuthTag(Buffer.from(tag,"hex"));
  const values:unknown=JSON.parse(Buffer.concat([decipher.update(Buffer.from(content,"hex")),decipher.final()]).toString("utf8"));
  if(!values||typeof values!=="object")throw new Error("Invalid saved sender configuration.");
  for(const name of ["GMAIL_USER","GMAIL_APP_PASSWORD","CTX_SENDER_NAME","CTX_LIVE_EMAIL_DISPATCH"]){
    if(!(name in values)||typeof (values as Record<string,unknown>)[name]!=="string")throw new Error("Invalid saved sender configuration.");
    process.env[name]=String((values as Record<string,unknown>)[name]);
  }
  return String(raw);
}

export const providerKeyNames={openai:"OPENAI_API_KEY",openrouter:"OPENROUTER_API_KEY",anthropic:"ANTHROPIC_API_KEY","openai-compatible":"OPENAI_COMPATIBLE_API_KEY",hubspot:"HUBSPOT_ACCESS_TOKEN",cal:"CAL_API_KEY"} as const;
export function saveProviderKey(provider:keyof typeof providerKeyNames,value:string){
  const encryptionKey=key();
  if(!encryptionKey)throw new Error("Configure the deployment encryption key before saving API keys.");
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey,iv);
  const content=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  outreachStore().setSetting("encrypted-key:"+provider,JSON.stringify({iv:iv.toString("hex"),tag:cipher.getAuthTag().toString("hex"),content:content.toString("hex")}));
  process.env[providerKeyNames[provider]]=value;
}
export function loadProviderKeys(){
  const encryptionKey=key();
  for(const [provider,name]of Object.entries(providerKeyNames)){
    const raw=outreachStore().setting("encrypted-key:"+provider);
    if(!raw)continue;
    if(!encryptionKey)throw new Error("Saved API keys require the deployment encryption key.");
    const encrypted=JSON.parse(String(raw)) as {iv:string;tag:string;content:string};
    const decipher=createDecipheriv("aes-256-gcm",encryptionKey,Buffer.from(encrypted.iv,"hex"));
    decipher.setAuthTag(Buffer.from(encrypted.tag,"hex"));
    process.env[name]=Buffer.concat([decipher.update(Buffer.from(encrypted.content,"hex")),decipher.final()]).toString("utf8");
  }
}

export function loadIntegrationSettings(){
  const raw=outreachStore().setting("integration-settings");
  if(!raw)return "";
  const settings=JSON.parse(String(raw)) as {hubspotWrites:boolean;calEventTypeId:string};
  if(typeof settings.hubspotWrites!=="boolean"||typeof settings.calEventTypeId!=="string")throw new Error("Invalid integration settings.");
  process.env.HUBSPOT_WRITES_ENABLED=String(settings.hubspotWrites);
  process.env.CAL_EVENT_TYPE_ID=settings.calEventTypeId;
  return String(raw);
}
