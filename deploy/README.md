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
Stop every writer, including web, outreach, indexing and any separately launched CLI worker. The `--writers-stopped` flag is an operator assertion, not a process detector. Individual SQLite backups are transaction-consistent; the stopped boundary makes the multiple databases and files consistent together.

```sh
mkdir -p backups
docker compose stop web worker rag-index
docker compose run --rm --no-deps -v "$PWD/backups:/backups" web node scripts/backup-data.mjs --writers-stopped
docker compose start web worker rag-index
```

Ensure the host backup directory is writable by container UID 1000. The backup contains `data/`, `config/` (when CTX_CONFIG_DIR is configured, as in Compose), and a checksum manifest. SQLite uses its backup API and integrity checks; WAL files are not copied directly. Attachments and other regular files are retained. Symlinks abort the backup. Existing backup destinations are never overwritten. A failed snapshot is removed and must not be used.

Protect backups as confidential data: file permissions are private, but backup contents are not encrypted by this script. Store them on encrypted storage with restricted access. Preserve `deploy/secrets` separately, particularly the settings encryption key, plus deployment configuration and the matching application image. Losing the key makes encrypted credentials unrecoverable. The read-only Phase 1 corpus mounted from the repository also needs versioned storage; it is outside these volumes.

Validate and restore into a **new staging directory** first:

```sh
docker compose run --rm --no-deps -v "$PWD/backups:/backups" web node scripts/restore-data.mjs /backups/BACKUP_NAME /backups/restore-check
```

The restore command checks every checksum and SQLite database before copying. It refuses existing destinations and never replaces running volumes. With all writers still stopped, copy the verified `restore-check/data/` and `restore-check/config/` trees into fresh replacement volumes owned by UID 1000, and point the deployment at those volumes. Preserve the previous volumes for rollback. Do not merge a restore into existing database/WAL files.

Start the restored instance with delivery and CRM writes disabled. Verify login, saved campaign/demo templates, conversation history, queued work, CRM state and health before resuming delivery. Uncertain delivery records require reconciliation; restoring an older snapshot must never automatically replay already-sent email. Run `npm run qa:recovery` for the isolated WAL/config/asset recovery and corrupted-backup rejection tests. A target-server application restore drill remains required.

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
