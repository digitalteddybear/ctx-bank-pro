/**
 * Append-Only Audit Trail for Zero-Trust HubSpot Gateway Operations.
 *
 * Persists all attempted, denied, dry-run, and executed CRM operations.
 * Enforces zero-secret leakage: all sensitive tokens or Bearer headers are strictly stripped.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type { PermittedOperation, GatewayOperationResult } from "./hubspot-types";

export interface AuditRecord {
  id: string;
  timestamp: number;
  operation: PermittedOperation;
  hubspotId: string;
  emailHash: string;
  messageId: string;
  approvedBy: string;
  decision: GatewayOperationResult["decision"];
  status: GatewayOperationResult["status"];
  sanitizedPayload: string;
  details: string;
  httpStatus?: number;
}

export function maskSecrets(input: string): string {
  return input
    .replace(/pat-[a-zA-Z0-9_\-\.]{20,}/gi, "pat-***[REDACTED]***")
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer ***[REDACTED]***")
    .replace(/key=[a-zA-Z0-9_\-\.]{20,}/gi, "key=***[REDACTED]***")
    .replace(/token["']?\s*:\s*["'][^"']+["']/gi, 'token": "***[REDACTED]***');
}

export class HubSpotAuditLogger {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    const targetPath =
      dbPath ??
      process.env.CTX_HUBSPOT_AUDIT_DB_PATH ??
      path.join(process.cwd(), "data/generated/outreach/hubspot_audit.sqlite");

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(targetPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hubspot_audit_log (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        operation TEXT NOT NULL,
        hubspot_id TEXT NOT NULL,
        email_hash TEXT NOT NULL,
        message_id TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        decision TEXT NOT NULL,
        status TEXT NOT NULL,
        sanitized_payload TEXT NOT NULL,
        details TEXT NOT NULL,
        http_status INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_hubspot_audit_msg ON hubspot_audit_log(message_id, operation);
      CREATE INDEX IF NOT EXISTS idx_hubspot_audit_hs ON hubspot_audit_log(hubspot_id);
    `);
  }

  /**
   * Idempotency verification: checks if a successful or applied operation
   * has already occurred for this messageId and operation.
   */
  isDuplicateMessageId(messageId: string, operation: PermittedOperation): boolean {
    const row = this.db
      .prepare(
        "SELECT id FROM hubspot_audit_log WHERE message_id = ? AND operation = ? AND status = 'applied' LIMIT 1"
      )
      .get(messageId, operation);
    return Boolean(row);
  }

  record(entry: {
    operation: PermittedOperation;
    hubspotId: string;
    email: string;
    messageId: string;
    approvedBy: string;
    decision: GatewayOperationResult["decision"];
    status: GatewayOperationResult["status"];
    payload: unknown;
    details: string;
    httpStatus?: number;
  }): string {
    const id = randomUUID();
    const timestamp = Date.now();
    const emailHash = createHash("sha256").update(entry.email.toLowerCase().trim()).digest("hex");
    const sanitizedPayload = maskSecrets(JSON.stringify(entry.payload));
    const sanitizedDetails = maskSecrets(entry.details);

    this.db
      .prepare(`
        INSERT INTO hubspot_audit_log (
          id, timestamp, operation, hubspot_id, email_hash,
          message_id, approved_by, decision, status,
          sanitized_payload, details, http_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        timestamp,
        entry.operation,
        entry.hubspotId,
        emailHash,
        entry.messageId,
        entry.approvedBy,
        entry.decision,
        entry.status,
        sanitizedPayload,
        sanitizedDetails,
        entry.httpStatus ?? null
      );

    return id;
  }

  listRecent(limit = 100): AuditRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM hubspot_audit_log ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      timestamp: Number(r.timestamp),
      operation: String(r.operation) as PermittedOperation,
      hubspotId: String(r.hubspot_id),
      emailHash: String(r.email_hash),
      messageId: String(r.message_id),
      approvedBy: String(r.approved_by),
      decision: String(r.decision) as GatewayOperationResult["decision"],
      status: String(r.status) as GatewayOperationResult["status"],
      sanitizedPayload: String(r.sanitized_payload),
      details: String(r.details),
      httpStatus: r.http_status ? Number(r.http_status) : undefined,
    }));
  }

  close() {
    this.db.close();
  }
}

const g = globalThis as typeof globalThis & { __ctxHubSpotAuditLogger?: HubSpotAuditLogger };

export function getHubSpotAuditLogger(): HubSpotAuditLogger {
  g.__ctxHubSpotAuditLogger ??= new HubSpotAuditLogger();
  return g.__ctxHubSpotAuditLogger;
}
