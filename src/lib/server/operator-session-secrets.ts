import { readFileSync } from "node:fs";

export function deploymentSecret(name: string): string {
  const filename = process.env[name + "_FILE"];
  try {
    return (filename ? readFileSync(filename, "utf8") : process.env[name] ?? "").trim();
  } catch {
    return "";
  }
}
