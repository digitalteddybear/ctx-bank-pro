import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { deploymentSecret } from "./operator-session-secrets";

interface StoredAdminProfile {
  schemaVersion: 1;
  email: string;
  passwordHash: string;
  sessionSecret: string;
}

function profilePath() {
  return path.join(process.env.CTX_CONFIG_DIR || path.join(process.cwd(), "data", "config"), "admin-profile.json");
}

function readStoredProfile(): StoredAdminProfile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(profilePath(), "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<StoredAdminProfile>;
    if (value.schemaVersion !== 1 || typeof value.email !== "string" || typeof value.passwordHash !== "string" || typeof value.sessionSecret !== "string") return null;
    return value as StoredAdminProfile;
  } catch {
    return null;
  }
}

export function adminEmail(): string {
  const configured = deploymentSecret("CTX_ADMIN_EMAIL");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured) ? configured : readStoredProfile()?.email || "";
}

export function sessionSigningSecret(): string {
  const configured = deploymentSecret("CTX_SESSION_SECRET");
  if (configured.length >= 32) return configured;
  const profileSecret = readStoredProfile()?.sessionSecret || "";
  if (profileSecret.length >= 32) return profileSecret;
  const directory = path.dirname(profilePath());
  const filename = path.join(directory, "session-signing-key");
  try {
    const persisted = readFileSync(filename, "utf8").trim();
    if (persisted.length >= 32) return persisted;
  } catch {
    // First guest access provisions the deployment signing key below.
  }
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const generated = randomBytes(32).toString("hex");
    writeFileSync(filename, `${generated}\n`, { mode: 0o600, flag: "wx" });
    chmodSync(filename, 0o600);
    return generated;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
      try {
        const persisted = readFileSync(filename, "utf8").trim();
        if (persisted.length >= 32) return persisted;
      } catch {
        return "";
      }
    }
    return "";
  }
}

function adminPasswordHash(): string {
  const configured = deploymentSecret("CTX_ADMIN_PASSWORD_HASH");
  return /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(configured) ? configured : readStoredProfile()?.passwordHash || "";
}

export function setupMode(): "create" | "bootstrap" {
  return /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(deploymentSecret("CTX_ADMIN_PASSWORD_HASH")) && sessionSigningSecret().length >= 32 ? "bootstrap" : "create";
}

function passkeyMatchesHash(passkey: string, encodedHash: string): boolean {
  const [algorithm, salt, encoded] = encodedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !encoded || !/^[a-f0-9]{128}$/.test(encoded)) return false;
  try {
    return timingSafeEqual(Buffer.from(encoded, "hex"), scryptSync(passkey, salt, 64));
  } catch {
    return false;
  }
}

export function verifyBootstrapPasskey(passkey: string): boolean {
  return setupMode() === "bootstrap" && passkeyMatchesHash(passkey, deploymentSecret("CTX_ADMIN_PASSWORD_HASH"));
}

export function hasAdminProfile(): boolean {
  const email = adminEmail();
  const hash = adminPasswordHash();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash) && sessionSigningSecret().length >= 32;
}

export function verifyAdminPasskey(email: string, passkey: string): boolean {
  const configuredEmail = adminEmail();
  const encodedHash = adminPasswordHash();
  return email.trim().toLowerCase() === configuredEmail.toLowerCase() && passkeyMatchesHash(passkey, encodedHash);
}

export function createInitialAdminProfile(email: string, passkey: string): void {
  if (hasAdminProfile()) throw new Error("The administrator profile is already configured.");
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Enter a valid administrator email.");
  if (passkey.length < 12 || passkey.length > 256) throw new Error("Use a passkey with 12 to 256 characters.");
  const bootstrapHash = setupMode() === "bootstrap" ? deploymentSecret("CTX_ADMIN_PASSWORD_HASH") : "";
  const bootstrapSecret = setupMode() === "bootstrap" ? sessionSigningSecret() : "";
  const salt = randomBytes(16).toString("hex");
  const profile: StoredAdminProfile = {
    schemaVersion: 1,
    email: normalizedEmail,
    passwordHash: bootstrapHash || `scrypt:${salt}:${scryptSync(passkey, salt, 64).toString("hex")}`,
    sessionSecret: bootstrapSecret || sessionSigningSecret(),
  };
  const target = profilePath();
  const directory = path.dirname(target);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const lock = `${target}.setup-lock`;
  let lockFd: number | null = null;
  try {
    lockFd = openSync(lock, "wx", 0o600);
    if (hasAdminProfile()) throw new Error("The administrator profile is already configured.");
    const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(profile)}\n`, { mode: 0o600, flag: "wx" });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Administrator setup is already in progress or complete.");
    throw cause;
  } finally {
    if (lockFd !== null) {
      closeSync(lockFd);
      try { unlinkSync(lock); } catch { /* the profile may already have been finalized */ }
    }
  }
}
