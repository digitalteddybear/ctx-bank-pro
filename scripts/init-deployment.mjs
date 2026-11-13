import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
const root=path.resolve("deploy/secrets");
await mkdir(root,{recursive:true,mode:0o700});
for(const name of ["session-secret","settings-key","operator-token","write-token"]){
  try{await writeFile(path.join(root,name),randomBytes(32).toString("hex")+"\n",{mode:0o600,flag:"wx"});}
  catch(error){if(error.code!=="EEXIST")throw error;}
}
try{await writeFile("deploy/runtime.env",await readFile("deploy/runtime.env.example"),{mode:0o600,flag:"wx"});}
catch(error){if(error.code!=="EEXIST")throw error;}
console.log("Deployment secret files initialized. Existing files were preserved. Add administrator and provider credentials before startup.");

try {
  const password=randomBytes(24).toString("base64url"),salt=randomBytes(16).toString("hex");
  await writeFile(path.join(root,"admin-password-hash"),"scrypt:"+salt+":"+scryptSync(password,salt,64).toString("hex")+"\n",{mode:0o600,flag:"wx"});
  await writeFile(path.join(root,"initial-admin-password"),password+"\n",{mode:0o600,flag:"wx"});
  console.log("Initial administrator password is in deploy/secrets/initial-admin-password. Change it before hosting.");
}catch(error){if(error.code!=="EEXIST")throw error;}
