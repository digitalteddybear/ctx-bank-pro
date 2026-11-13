# AI-native workspace progress

Implementation checklist, updated 2026-11-02. UI keeps the Astryx component system and CTX tokens.

## Phase 1 — Chat and workspace shell

- [x] Landing submission creates a persisted conversation and carries the first prompt and uploaded document IDs into it.
- [x] Chats appear under Mission Control; each conversation can return to Mission Control.
- [x] Ordinary answers use a centered transcript and do not open an empty artifact pane.
- [x] Structured generative widgets can open a resizable workspace panel.
- [x] Transcript uses Astryx chat, Markdown, and tool-call renderers; the conversation store validates persisted records with Zod.
- [x] Stream events preserve the OpenAI SSE event name and CRLF framing; a turn completes only after `response.completed`.
- [x] Add stable run IDs, explicit stop/cancel, persistent run events, and reconnect/replay after refresh.
- [x] Follow new stream content only while the reader is near the bottom; preserve review position above that threshold.
- [x] Add a persisted, resizable workspace panel and full-width mobile workspace mode.
- [x] Add Preview/Code tabs, expand/close, copy/download, and persisted version selection.

## Phase 2 — Structured UI and generated artifacts

- [x] Existing schema-validated structured widgets are rendered from the generative widget registry: lead qualification, compliance gate, architecture diff, knowledge subgraph, and fleet trace.
- [ ] Add approved component renderers for source lists, tables, charts, forms, status panels, and approval panels.
- [x] Add validated document, code, and React artifact proposals. Persist them as immutable versions independent of chat text; render document Markdown and inspectable code.
- [x] Add isolated React live preview and bounded diagnostics.
- [ ] Complete the shared generated-UI token set and illustrative-data labels for every structured renderer.

## Phase 3 — Artifact store and agent tools

- [x] Store artifacts independently from transcript messages with local-workspace ownership, conversation links, provenance, immutable versions, and stable IDs.
- [x] Add version-checked read/update/restore APIs; reject stale writes.
- [x] Bind typed artifact proposals to the agent response contract and persist them with run/model/prompt provenance.
- [x] Add locally authenticated, schema-validated create/read/update/render/diagnostic tool operations with optimistic version checks.
- [x] Connect OpenAI Responses function calls to validated create/read/update/render/diagnostic operations; persist and replay tool-call lifecycle events.

## Phase 4 — Streaming and recovery

- [x] Stream assistant text and structured final widget payloads through the server route.
- [x] Add versioned run event envelopes, event IDs, sequence numbers, replay, explicit cancellation, and process-restart failure recovery.
- [ ] Add artifact file deltas, committed-version events, and stale-build rejection.

## Phase 5 — Isolated previews and diagnostics

- [x] Define a sandboxed React preview runtime with a separate worker compiler, import allowlist, source/output limits, build timeout, isolated iframe origin, restrictive CSP, runtime diagnostics, and version pinning.
- [x] Generated code never runs in the CTX origin; the Preview pane retains the prior iframe while a different artifact/version compiles.
- [x] Keep the prior preview mounted while the next artifact/version compiles.
- [ ] Add stronger runtime CPU/memory enforcement and automated preview disposal checks.

## Phase 6 — Research, sources, and workflow continuity

- [x] Add OpenAI-native web search for research tasks, store URL citation provenance, and display clickable source links.
- [x] Surface truthful tool activity and preserve the existing no-advice language.
- [ ] Run an end-to-end browser journey with the connected OpenAI account; verify research citations and artifact tool use.
- [ ] Validate ordinary answer, artifact creation/edit/recovery, approval, and mobile journeys before release.

## Validation so far

- `npm test` passes typecheck, repo lint, docs QA, and Netron QA. Lint reports 58 existing unused-import/variable warnings across other UI/template files.
- `npm run qa:ai-workspace` passes SQLite restart/import, run idempotency/event order, artifact version/restore/conflict, preview compile/external-import rejection, and App Editor draft boundary tests.
- `npm run build` passes after converting `/kanban-board` from uncompiled `stylex.create` to equivalent CSS module/token styles.
- Manual browser checks for responsive sizing, replay in a real tab refresh, and real OpenAI web search/citations remain pending.

- `npm run typecheck` passes after the chat shell and architecture allowlist changes.
- `npm run qa:docs` passes.
- OpenAI OAuth model selection and Responses streaming behavior were checked against the official [Sign in with ChatGPT model and inference guide](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).
- The attached screenshot exposed real runtime regressions; the browser journey should be repeated against the connected local account to confirm the event framing fix with its live stream.

## Final verification — 2026-11-02

- `npm test` passes: typecheck, lint, docs QA, and Netron QA. Lint has 58 warnings and zero errors; warnings are unused imports/variables in existing unrelated files.
- `npm run qa:ai-workspace` passes all 5 persistence, run/event, artifact versioning, preview isolation, and App Editor boundary checks.
- `npm run build` passes, including static generation and route tracing for the AI workspace APIs.
- OpenAI research uses the Responses API `web_search` tool and renders URL citations from the provider response, following the [official web search guide](https://developers.openai.com/api/docs/guides/tools-web-search). Automated tests cover local workspace tools and preview safety; native search and function calls still need a browser run with the linked account.
