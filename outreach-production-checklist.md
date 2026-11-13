# Outreach production checklist

Updated 2026-11-02. Implemented is not the same as verified or released.

## Audit
- [x] Initial repository scan and automated baseline; see repository-audit.md.
- [x] LangSmith handoff in agent-contingencies-langsmith.txt (evaluations not yet run).
- [x] Termination candidates flagged; no deletions.
- [x] Strict IMAP TLS, canonical recipient check at SMTP boundary, loopback-only unauthenticated Agents access.
- [ ] Finish audit remediation, privacy checks, and browser regression coverage.

## Production implementation
- [x] Durable pacing primitives: ramp 25/85/160/160/170/170/179, 250 total cap, London weekday gate, reply priority, uncertain-send recovery. Two tests pass; not connected to SMTP yet.
- [x] Connection-test API: real SMTP and IMAP handshake verified without email delivery.
- [x] Campaign cohort preview, idempotent durable held enrollment, and Astryx launcher. Four campaign tests pass; desktop/mobile modal checked.
- [x] Prepared-batch Pause/Resume persists across registry reloads; resume preserves permission holds.
- [ ] Permission ingestion, release of held enrollment, worker-enforced production pause/resume and live launch.
- [x] Sender settings UI and authenticated atomic private credential saving; temporary-file storage checks pass.
- [ ] Sender UI browser verification, release build, and standalone-worker config reload.
- [ ] Shared OpenAI transport for outreach agents.
- [ ] Standalone supervised worker and production delivery integration.
- [ ] Persistent inbound mailbox ingestion and classification.
- [ ] HubSpot email engagements, briefing notes, durable reconciliation.
- [ ] Cal signatures, idempotent booking updates and follow-up cancellation.
- [ ] Taxonomy and extension docs.
- [ ] Browser parity, failure/restart simulations, release build, backup/restore.

## Operator provisioning — towards release
- [ ] Authoritative contact-permission records and approved compliance sources.
- [ ] HUBSPOT_ACCESS_TOKEN and CAL_WEBHOOK_SECRET in private environment config.
- [ ] Always-on host, HTTPS hostname, server model authentication.
- [ ] Controlled test recipient, designated CRM test contact, test booking.
- [ ] Operator launch of first 25-lead batch.

## Latest verification
- Isolated production build passed for the campaign launcher and API. Temporary build output removed; running app output was untouched.
- Batch lifecycle additions pass four campaign tests, typecheck, and focused lint.

## Other-agent work reconciled — 2026-11-02
- [x] Reviewed RAG/task-logs/LangSmith and matched changes to current code.
- [x] LangSmith tracing, Python OAuth/FastEmbed adapters, auth helpers and constrained HubSpot gateway exist; reuse these implementations.
- [ ] Block simulated dispatch/booking from live CRM writes; retain HUBSPOT_WRITES_ENABLED=false until fixed.
- [ ] Align pilot batch selection with fixed approved-25 CRM allowlist.
- [ ] Fix CRM dry-run/live idempotency, durable retries and email-vs-note implementation.
- [ ] Redact exported traces; implement real Python tool binding or explicitly scope it to text.
- [ ] Fix clean-runner CI Node/path requirements and reject incomplete/fallback evaluation results.
- [ ] Consolidate actual route authentication with the new auth helper.
See task-logs/2026-11-02-langsmith-plan-reconciliation.md for evidence and revised launch gates.
