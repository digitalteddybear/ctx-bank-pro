import { DatabaseSync } from "node:sqlite";
try{
  const db=new DatabaseSync(process.env.CTX_OUTREACH_DB_PATH??"/data/outreach/workflows.sqlite",{readOnly:true});
  const at=Number(db.prepare("SELECT value FROM settings WHERE key='worker-heartbeat'").get()?.value??0);
  db.close();
  process.exit(Date.now()-at<120000?0:1);
}catch{process.exit(1);}
