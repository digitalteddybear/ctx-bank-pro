# CTX UI backend mapping — 1 November 2026

The active implementation paths differ from the incoming handover: the chat
landing is `network/mission-control-view.tsx`; the repository view and IDE are
`templates/architecture/architecture-view.tsx` and `architecture-ide-overlay.tsx`.

- Mission Control uploads actual files through `/api/documents`, references their
  returned IDs, loads the five existing workflow agents from `/api/agents`, and
  submits `dispatch-instruction`. Receipts persist in the outreach event store
  and publish to the selected message-bus recipient. This is instruction intake;
  the backend has no general natural-language execution handler. The UI states
  that execution requires review. History comes from `/api/agents/instructions`.
- Inbox rows contain only persisted runs. Queued/waiting-reply runs appear in
  Inbox, held/escalated runs in Escalations, awaiting-approval runs in Waiting,
  and booked/completed runs in Resolved. Counts derive from these same rows.
  Reply records an inbound workflow event; it does not send email. Pause and
  takeover use existing backend commands, with failures surfaced in the UI.
- Architecture removes injected canvas-editor fixture nodes and scans runtime,
  scripts, document ingestion and MCP sources. `ingestion.ts` does not exist;
  `document-repository.ts` implements ingestion in this checkout. IDE editing
  and Save/⌘S share Architecture's version-checked draft API. Drafts stay in
  `data/architecture-drafts`, preserving the graph file's schema. The terminal
  reads live orchestrator message events rather than build-output fixtures.
- Node tags PATCH the canonical top-level `tags` field accepted by the graph
  schema; deletion uses DELETE and soft-deletes linked edges. Both require the
  configured graph write token. No credentials are embedded or persisted by UI.
- The application retains its four-second poll. It publishes
  `ctx:backend-updated` for agent/chat/terminal subscribers; mutations request
  immediate reconciliation using `ctx:backend-sync`. Agents' competing timer
  was removed. Existing Astryx component layouts and styles are retained.

Astryx discovery: `build "Wire existing chat inbox tree editor and node inspector
to backend"`; inspected ChatComposer, TextArea and Dialog. No dependencies added.

Validation: TypeScript passes; focused changed-component lint passes; architecture
and orchestrator QA pass. Browser QA intercepts writes and verifies chat dispatch,
live-only inbox rows, takeover, reply, desktop/mobile overflow and IDE Save/⌘S.
Full-project lint has existing unused declarations in other overhaul files.
The isolated webpack build compiles and typechecks but fails prerendering the
existing `/kanban-board` page due to an uncompiled runtime `stylex.create` call.
