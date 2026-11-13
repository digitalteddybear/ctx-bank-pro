import { spawn } from "node:child_process";
import path from "node:path";
import { hubspotContext } from "./hubspot-lead-context";
let active: Promise<{status:string}> | undefined;
export function indexCrmContext() {
  return active ??= runIndex().finally(()=>{active=undefined;});
}
async function runIndex(): Promise<{status:string}> {
  if(process.env.CTX_RAG_INDEX_MODE==="external")return {status:"queued"};
  const rag=path.resolve(process.env.CTX_RAG_ROOT??path.resolve(process.cwd(),"../../RAG"));
  const allowed=["PATH","HOME","TMPDIR","CTX_OUTREACH_DB_PATH","CTX_EMBEDDINGS_PROVIDER","CTX_EMBEDDINGS_MODEL","HF_HOME","HF_HUB_OFFLINE"];
  // Do not pass CRM or chat credentials to the embedding process.
  const env={NODE_ENV:process.env.NODE_ENV ?? "development",...Object.fromEntries(allowed.flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]]]))};
  return new Promise(resolve=>{
    const child=spawn(process.env.CTX_RAG_PYTHON ?? path.join(rag,".venv/bin/python"),[path.join(rag,"tools/index_crm_context.py")],{cwd:rag,env,stdio:"ignore"});
    const timer=setTimeout(()=>child.kill("SIGTERM"),180000);
    let settled=false;
    const finish=(ok:boolean)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      hubspotContext().store.event("crm-sync",ok?"index_completed":"index_failed",{message:ok?"CRM embeddings persisted":"Index worker unavailable or failed; pending chunks remain recoverable"});
      resolve({status:ok?"ready":"pending"});
    };
    child.once("error",()=>finish(false));child.once("exit",code=>finish(code===0));
  });
}
