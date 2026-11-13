# CTX server deployment

Status: implementation and validation in progress. Do not activate outreach before live acceptance.

## Required inputs
- Linux server with Docker Compose, persistent local disk and ports 80/443.
- CTX hostname with DNS pointing to that server.
- Administrator email/password; production model API provider and model.
- Existing Gmail, HubSpot and Cal.com credentials; canonical Phase 1 corpus.
- Approved opening text, reply HTML, reply preferences and selected campaign contacts.

## Prepare
From App/knowledge-network:
1. Run node scripts/init-deployment.mjs. It preserves existing secrets.
2. Set CTX_ADMIN_EMAIL in deploy/runtime.env.
3. Generate the password hash: read -s CTX_ADMIN_PASSWORD; printf '%s' "$CTX_ADMIN_PASSWORD" | node scripts/admin-password.mjs > deploy/secrets/admin-password-hash; unset CTX_ADMIN_PASSWORD
4. Put each credential value in the named file from deploy/runtime.env. Do not commit these files.
5. Keep CTX_LIVE_EMAIL_DISPATCH and HUBSPOT_WRITES_ENABLED false for initial deployment.
6. Set CTX_DOMAIN in the environment used by Compose.
7. Keep the repository layout containing App/knowledge-network and RAG. Compose mounts the canonical corpus read-only.

## Build and inspect
docker compose config
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 web worker rag-index proxy

Web, worker and indexing data use persistent named volumes. Caddy provisions HTTPS for CTX_DOMAIN. Sign in with the administrator credentials. Configure the sender, API model, templates and campaign from CTX.

## Backup and restore
For a consistent application snapshot:
docker compose stop web worker rag-index
docker compose run --rm --no-deps -v "$PWD/backups:/backups" web node scripts/backup-data.mjs
docker compose start web worker rag-index

Protect the resulting backup and deploy/secrets together; losing the encryption key makes saved credentials unrecoverable. OAuth private config, if used, also needs a separate backup of ctx-config.

Restore only with web, worker and indexing stopped. Restore the backed-up data tree into ctx-data using a maintenance container, preserving ownership UID 1000. Start services and verify health and stored settings before enabling delivery. Never overwrite an active SQLite database or delete Docker volumes during an upgrade.

## Upgrade and rollback
Back up data before migrations. Tag the current application image before replacing it. Rebuild and start the new image, inspect all health checks, then run the controlled acceptance journey. Rollback uses the previous image and its compatible backup; do not assume older code can read a newer database schema.

## Acceptance
- Saved settings survive browser closure and container restart.
- Web process restart does not stop the worker.
- SMTP delivery, IMAP reply, agent reply and HubSpot activity reconcile.
- Opt-outs and manual takeover stop queued autonomous delivery.
- Duplicate inbound events and process crashes do not duplicate committed work.
- Per-contact identity/context and the exact saved reply template remain consistent.
- API-based booking reconciliation works; webhook deployment remains deferred.
