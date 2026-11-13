import { randomBytes, scryptSync } from "node:crypto";
let password="";
for await(const chunk of process.stdin)password+=chunk;
password=password.replace(/\r?\n$/,"");
if(password.length<12)throw new Error("Use at least 12 characters.");
const salt=randomBytes(16).toString("hex");
process.stdout.write("scrypt:"+salt+":"+scryptSync(password,salt,64).toString("hex")+"\n");
