# Repository audit — 2026-11-02

Status: initial static and automated baseline complete; production implementation and browser regression audit remain in progress. This is not a production-readiness certification.

## Baseline

161 source files and 34 scripts inventoried. Existing extensive tracked/untracked work preserved, including recent LangSmith tracing changes. `npm test` passes (typecheck, lint with 58 warnings, docs and Netron QA); `qa:outreach` passes 24 tests; `qa:ai-workspace` passes 5 tests. No live outreach or CRM writes performed.

## Findings

| ID | Severity | Evidence / location | Impact | Correction / verification | Status |
| --- | --- | --- | --- | --- | --- |
| AUD-001 | Critical | outreach/engine.ts dispatch inserts `simulated:true`, `externalDelivery:false` | Live inference does not imply actual delivery | Separate production SMTP outbox, acceptance and ambiguity states; crash/retry simulation | Open |
| AUD-002 | High | outreach/transport/imap.ts three `rejectUnauthorized:false` options | Certificate verification disabled for mailbox credentials | Restore strict TLS; verify options and handshake failure behavior | Open |
| AUD-003 | Critical | outreach/safeguards.ts validatePhase1Contact accepts boolean/tag/ID prefix | Caller can claim cohort membership without canonical email match | Resolve canonical lead ID and email at production enrollment and transport boundary | Open |
| AUD-004 | High | api/agents route authorised() allows same-origin without restricting loopback | Same-origin is not operator authentication on public hosts | Require authenticated operator on hosted deployment; retain loopback local mode | Open |
| AUD-005 | High | outreach/runtime.ts starts interval on dashboard access | Production work depends on app lifecycle; duplicate processes possible | Supervised standalone worker, DB leases, explicit ownership | Open |
| AUD-006 | High | outreach/transport/imap.ts helper fetches only latest 15 messages; processed UIDs supplied in memory | Missed replies and duplicate ingestion after restart | Durable UIDVALIDITY/UID checkpoint and message receipts | Open |
| AUD-007 | High | outreach/engine.ts traceable receives complete context including dossier and transcript | External trace export can disclose personal correspondence if enabled | Redacted trace serialization and explicit tracing configuration; retain operator changes | Review required |
| AUD-008 | Medium | api/agents telemetry infers delivered from nonfailed runs; latency from adjacent event times | Reports acceptance/failures as inbox delivery and idle time as execution latency | Use explicit delivery events; mark unavailable metrics unknown | Open |
| AUD-009 | High | outreach models uses separate missing provider configuration; runtime checks narrower URL/key condition | Chat OAuth works while outreach inference never executes | Shared provider transport and tested capability check; no fixture fallback | Open |
| AUD-010 | Medium | scripts/mission-control-browser-qa.mjs expects static attachment names and greeting | Existing UI QA no longer verifies intended live interface | Replace obsolete assertions with current landing/upload/chat journeys | Open |
| AUD-011 | Medium | 58 eslint unused import/variable warnings | Maintenance noise and abandoned branches | Flag for review; no removal without approved candidate list | Flagged |
| AUD-012 | High | no HubSpot durable integration or Cal webhook route | Missing CRM continuity and booking cancellation loop | Durable CRM jobs, authenticated signed booking ingestion, replay QA | Open |
| AUD-013 | High | existing SMTP helpers lack durable uncertain-send reconciliation | Retrying after acceptance can duplicate outbound mail | Stable Message-ID, sending state, reconciliation hold | Open |
| AUD-014 | High | Phase 1 loader explicitly describes historical evidence, not permission | 949 validated dossiers cannot automatically become 949 eligible recipients | Persist permission records and report held/excluded counts | Open |

Paths in findings are relative to `src/lib/server` unless otherwise stated. Findings are confirmed by code inspection; exploit scenarios and external service behavior have not been exercised. No finding authorizes deletion of runtime data, removal of approvals, or automatic live delivery.

## Release gates

Complete production features, address critical/high findings, test browser flows and restart scenarios, provision HubSpot/Cal credentials and host, verify contact permission/source records, perform controlled integration checks, and obtain operator batch launch. Roadmap file was not found; supplied approved plan is the implementation baseline.

## Remediation checkpoint

- AUD-002: fixed strict certificate verification in all three IMAP clients.
- AUD-003: SMTP boundary now resolves recipient against canonical corpus and requires matching Phase 1 lead ID. Enrollment validation remains outstanding; do not mark the full finding closed.
- AUD-004: local unauthenticated fallback now requires loopback hostname; hosted operator/session provisioning remains outstanding.
- Added durable scheduler primitives and two passing tests for the exact ramp, London DST/weekend windows, reply priority, pacing, total cap, and uncertain crash recovery. Scheduler is not yet connected to production delivery.
- Added POST /api/agents/credentials/test with bounded real SMTP/IMAP handshakes and redacted status results. Existing Gmail credentials passed both handshakes on 2026-11-02. No email sent.
- Post-change typecheck and focused ESLint pass.

## Outstanding implementation (not a completed production release)

Campaign launcher/enrollment and permission records; sender save UI/API; integration of durable scheduler with engine and supervised daemon; full inbox checkpoint service; shared outreach OpenAI adapter; HubSpot outbox and Cal webhook; release deployment package; taxonomy/docs updates; browser parity audit and complete regression suite. Missing HubSpot/Cal credentials and authoritative contact permission source have been requested. No termination candidates deleted.

## Campaign preparation checkpoint

Canonical cohort preview and durable idempotent batch preparation now exist at /api/agents/campaign with an Astryx Agents modal. Selections are held pending permission records; no production run or email job is created. Schema validation, repeat-request conflict checks, and deduplication by lead ID and normalized email are tested. Three campaign tests pass. Typecheck, docs QA, and repository lint pass (58 pre-existing warnings). Desktop/mobile modal inspected; production worker and live permission enrollment remain outstanding.

## Prepared batch lifecycle

Pause/resume now updates persisted batch and enrollment states transactionally, records events, and treats repeat transitions idempotently. Resume returns to held pending verified permissions; it does not create inference or email jobs. Four campaign tests pass, including pause persistence, unknown IDs, and no permission bypass. Isolated production build passed before these lifecycle additions; subsequent typecheck and focused lint pass.

## Production completion audit — 2026-11-11

Baseline: typecheck, quiet ESLint and existing outreach/campaign/HubSpot offline suites passed. This does not establish live production behavior. Full production build is being checked in a separate output directory.

Confirmed dependencies: canonical corpus is configurable but defaults outside the app; CRM indexing assumes a Python virtualenv outside the app; local-only request authorization cannot serve authenticated hosted browser users; fixed CRM pilot allowlist and held campaign enrollment are separate from live demo delivery.

Template fixes: parser-based HTML sanitization replaces regex-based sanitization; preview calls the same renderer as SMTP. Campaign and Demo templates have independent persisted scopes and version history. Demo run snapshots prevent a later template edit from changing an active conversation. Safe email CSS, images, tables and links are retained.

Worker groundwork: explicit external-worker mode prevents the web process from booting background loops. A standalone service entrypoint and shutdown function are available. This does not yet connect campaign enrollments to live SMTP or make worker recovery production-complete.

Cleanup disposition: no active route, UI surface, runtime database, lead record or test fixture deleted. Cold routes and idle components are not evidence of a runtime performance issue. The accumulated dirty tree must be preserved; deletion candidates require reachability/usage evidence and regression coverage.
