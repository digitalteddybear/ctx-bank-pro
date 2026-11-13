import { randomBytes, scryptSync } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface, emitKeypressEvents } from "node:readline";

const envPath = path.join(process.cwd(), ".env.local");
const lines = await readFile(envPath, "utf8").catch(() => "");
const input = createInterface({ input: process.stdin, output: process.stdout });
const email = (await new Promise(resolve => input.question("Administrator email: ", resolve))).trim().toLowerCase();
input.close();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid administrator email.");

function readHidden(prompt) {
  const stdin = process.stdin;
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") throw new Error("Run this command in an interactive terminal.");
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = result => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(false);
      process.stdout.write("\n");
      resolve(result);
    };
    const onKeypress = (character, key) => {
      if (key?.ctrl && key.name === "c") {
        stdin.off("keypress", onKeypress);
        stdin.setRawMode(false);
        process.stdout.write("\n");
        reject(new Error("Cancelled."));
      } else if (key?.name === "return" || key?.name === "enter") {
        finish(value);
      } else if (key?.name === "backspace") {
        value = value.slice(0, -1);
      } else if (!key?.ctrl && !key?.meta && character) {
        value += character;
      }
    };
    stdin.on("keypress", onKeypress);
  });
}

const passkey = await readHidden("Administrator passkey (12+ characters): ");
const confirmation = await readHidden("Confirm passkey: ");
if (passkey.length < 12 || passkey !== confirmation) throw new Error("Passkeys must match and contain at least 12 characters.");

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(passkey, salt, 64).toString("hex");
const existingSecret = lines.match(/^CTX_SESSION_SECRET=(?:"([^"]*)"|'([^']*)'|([^\r\n]*))/m);
const sessionSecret = (existingSecret?.[1] ?? existingSecret?.[2] ?? existingSecret?.[3] ?? "").trim();
const existingValue = name => {
  const match = lines.match(new RegExp(`^${name}=(?:\"([^\"]*)\"|'([^']*)'|([^\\r\\n]*))`, "m"));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
};
const updates = {
  CTX_ADMIN_EMAIL: email,
  CTX_ADMIN_PASSWORD_HASH: `scrypt:${salt}:${hash}`,
  CTX_SESSION_SECRET: sessionSecret.length >= 32 ? sessionSecret : randomBytes(32).toString("hex"),
  CTX_OUTREACH_OPERATOR_TOKEN: existingValue("CTX_OUTREACH_OPERATOR_TOKEN").length >= 32 ? existingValue("CTX_OUTREACH_OPERATOR_TOKEN") : randomBytes(32).toString("hex"),
  AGENT_WRITE_TOKEN: existingValue("AGENT_WRITE_TOKEN").length >= 32 ? existingValue("AGENT_WRITE_TOKEN") : randomBytes(32).toString("hex"),
};
let output = lines.trimEnd();
for (const [name, value] of Object.entries(updates)) {
  const expression = new RegExp(`^${name}=.*$`, "m");
  const line = `${name}="${value}"`;
  output = expression.test(output) ? output.replace(expression, line) : `${output}${output ? "\n" : ""}${line}`;
}
await writeFile(envPath, `${output}\n`, { mode: 0o600 });
await chmod(envPath, 0o600);
process.stdout.write(`Administrator profile configured for ${email}. Restart CTX to apply it. The passkey and hashes were not printed.\n`);
