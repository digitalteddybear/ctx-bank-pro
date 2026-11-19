# CTX Bank Pro — Security & Access Control

## 1. Authentication & Authorization Boundaries

- **Session & Proxy Layer (`src/proxy.ts`, `src/lib/server/operator-session.ts`)**:
  - Protects console routes and API endpoints using signed `HS256` session cookies (`ctx-operator`) or high-entropy bearer tokens (`CTX_OUTREACH_OPERATOR_TOKEN`) compared via `crypto.timingSafeEqual`.
  - Enforces a minimum secret length of 32 characters (`MIN_SECRET_LENGTH = 32`) and rejects known development placeholders (`DISALLOWED_PLACEHOLDERS`).
- **Route-Level Defense-in-Depth**:
  - `src/lib/server/auth.ts`: `verifyApiRequest` defaults to `allowSameOrigin: false`, requires explicit `Origin` or `Sec-Fetch-Site: same-origin` headers when same-origin fallback is opted into, and reads secrets via `deploymentSecret()` (supporting Docker `*_FILE` secret mounts).
  - `/api/documents`, `/api/ctx-app-agent`, `/api/ctx-app-agent/stream`, `/api/agents/*`, `/api/notifications`, `/api/integrations/hubspot/context`: Enforce `hasLocalWorkspaceAccess(request)` at the route boundary.
  - `/api/integrations/hubspot`: Protected by `HUBSPOT_GATEWAY_SHARED_SECRET` (or `CTX_OUTREACH_OPERATOR_TOKEN`) via `deploymentSecret()` and `safeEqualSecrets()`.
  - `/api/webhooks/cal`: Verifies `x-cal-signature-256` HMAC-SHA256 signatures with `timingSafeEqual` against `deploymentSecret("CAL_WEBHOOK_SECRET")` and binds bookings to SHA-256-hashed issued references.

## 2. Zero-Trust HubSpot CRM Isolation

- `HUBSPOT_ACCESS_TOKEN` is isolated inside `HubSpotZeroTrustGateway` (`src/lib/server/integrations/hubspot-gateway.ts`) and never exposed to LLM prompts, client bundles, or audit logs.
- `HUBSPOT_WRITES_ENABLED` defaults to `false` (fail-closed dry-run mode).
- Writes are restricted to the frozen `APPROVED_25_LEADS` allowlist and whitelisted properties (`ctx_status`, `ctx_last_contact`, `ctx_booking_link_sent`).

## 3. Telemetry & Data Minimization

- LangSmith tracing in `src/lib/server/outreach/engine.ts` (`tracedStageInvoke`) transmits only anonymized structural metadata (`stage`, `runId`, `classification`, `intent`, `messagePhase`, `transcriptTurns`, `sourceCount`, `synthetic`, `sandbox`)—never raw prospect emails, names, phone numbers, or correspondence transcripts.
