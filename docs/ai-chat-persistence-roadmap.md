# AI Chat and account persistence roadmap

## Current local development state

- OAuth registration and refresh credentials are written with restrictive file permissions under `~/.config/ctx-bank-pro` and survive browser refreshes and ordinary app restarts on the same machine and user account.
- Set `CTX_CONFIG_DIR=/absolute/path/to/ctx-config` in `.env.local` if the development runner uses an inconsistent home directory. Keep that directory private, persistent, and outside the repository; never commit its contents.
- AI settings remain in browser `localStorage`. Conversations, run events, generated artifacts, source references, and artifact versions now persist in SQLite at `data/generated/ai-workspace/workspace.sqlite` (override with `CTX_AI_WORKSPACE_DB_PATH`). The database directory is created with owner-only permissions and is ignored by Git. Existing browser conversations import once into SQLite; the browser copy is only a cache after migration. This survives browser refresh and app/server restart on the same machine.

## Ordered production roadmap

1. **Stable local persistence — implemented:** SQLite stores conversations, messages, runs/events, artifacts, immutable versions, and source records. Recheck recovery in the local browser after a restart; settings still live in `localStorage`.
2. **Hosted app store:** move from single-machine SQLite to a managed database and object storage with migrations, authenticated per-user/workspace ownership, retention, export, and deletion controls. SQLite currently identifies one local workspace, not individual people.
3. **Account identity:** establish authenticated user sessions and bind each conversation, setting set, and provider connection to a user or workspace. Add authorization checks to every read and mutation endpoint.
4. **Credential vault:** replace workstation-local OAuth files for hosted deployments with an encrypted secret store (KMS-backed envelope encryption), rotation, revocation, and audit records. Never return tokens to the browser.
5. **Recovery and operations:** configure encrypted backups, restore drills, schema migration checks, health monitoring for token refresh, and a documented incident procedure for credential loss or revocation.
6. **Release gate:** test browser reload, app/server restart, expired access-token refresh, sign-out, multi-user isolation, backup restore, and conversation recovery before production rollout. Configure automated encrypted backups and perform restore drills before storing user data in a hosted service.
