import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, readdir, copyFile, stat } from "node:fs/promises";
import path from "node:path";
const source=path.resolve(process.env.CTX_DATA_DIR??"/data");
const destination=path.resolve(process.argv[2]??path.join("/backups",new Date().toISOString().replace(/[:.]/g,"-")));
if(destination===source||destination.startsWith(source+path.sep))throw new Error("Backup destination must be outside the data directory.");
async function visit(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const input=path.join(directory,entry.name),relative=path.relative(source,input),output=path.join(destination,relative);
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory()){await visit(input);continue;}
    await mkdir(path.dirname(output),{recursive:true,mode:0o700});
    if(entry.name.endsWith(".sqlite")){
      const db=new DatabaseSync(input,{readOnly:true});
      try{await backup(db,output);}finally{db.close();}
    }else if(entry.name.endsWith(".json"))await copyFile(input,output);
  }
}
await stat(source);
await mkdir(destination,{recursive:true,mode:0o700});
await visit(source);
console.log(JSON.stringify({backup:destination,sqliteBackup:true}));
