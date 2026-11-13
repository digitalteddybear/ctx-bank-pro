/**
 * CTX Authentication Token & Secret Generator
 *
 * Usage:
 *   node --import tsx scripts/generate-auth-token.ts --secret
 *   node --import tsx scripts/generate-auth-token.ts --mint --sub operator-dylan --scope operator --expires 30d
 */
import path from "node:path";
import fs from "node:fs";
import { generateSecureSecret, mintToken } from "../src/lib/server/auth";

// Load .env.local if available
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Ignored
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mintIndex = args.indexOf("--mint");

  if (mintIndex !== -1 || args.includes("--jwt")) {
    const subIdx = args.indexOf("--sub");
    const scopeIdx = args.indexOf("--scope");
    const expIdx = args.indexOf("--expires");

    const subject = subIdx !== -1 && args[subIdx + 1] ? args[subIdx + 1] : "ctx_operator";
    const scopes = scopeIdx !== -1 && args[scopeIdx + 1] ? args[scopeIdx + 1].split(",") : ["operator", "agent_write"];
    const expires = expIdx !== -1 && args[expIdx + 1] ? args[expIdx + 1] : "30d";

    try {
      const jwt = await mintToken(subject, scopes, expires);
      console.log("\n============================================================");
      console.log("             CTX SIGNED JSON WEB TOKEN (JWT)");
      console.log("============================================================");
      console.log(`Subject:    ${subject}`);
      console.log(`Scopes:     ${scopes.join(", ")}`);
      console.log(`Expires:    ${expires}`);
      console.log("\nToken:");
      console.log(jwt);
      console.log("\nUsage in curl / HTTP request:");
      console.log(`  curl -H "Authorization: Bearer ${jwt}" http://localhost:3000/api/agents`);
      console.log("============================================================\n");
    } catch (err) {
      console.error("Failed to mint JWT:", (err as Error).message);
      process.exit(1);
    }
    return;
  }

  // Default: Generate 256-bit high-entropy secrets
  const operatorSecret = generateSecureSecret(32);
  const writeSecret = generateSecureSecret(32);
  const jwtSecret = generateSecureSecret(32);

  console.log("\n============================================================");
  console.log("        CTX PRODUCTION SECRETS (256-BIT CRYPTO)");
  console.log("============================================================");
  console.log("Generated cryptographically secure random secrets for .env.local:\n");
  console.log(`CTX_OUTREACH_OPERATOR_TOKEN="${operatorSecret}"`);
  console.log(`AGENT_WRITE_TOKEN="${writeSecret}"`);
  console.log(`CTX_JWT_SECRET="${jwtSecret}"`);
  console.log("\nAdd these lines to App/knowledge-network/.env.local");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
