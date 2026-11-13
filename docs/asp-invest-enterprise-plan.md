# ASP Invest application implementation plan

The active application is `App/knowledge-network`. Its Next.js shell, graph renderers, inspector, upload pipeline and MCP interface form the baseline for the larger CTX Bank application. Sibling prototypes are reference material, not additional production entry points.

## Current integration

- Consume the Python pipeline's retained Markdown dossiers from `RAG/corpus/chunks/normalized-contacts`.
- Represent each retained lead once, keyed by immutable HubSpot ID, with links through classification groups to ASP Invest.
- Keep the original Markdown in source provenance; display readable descriptions starting with a prospect summary.
- Retain 949 contacts from the 1,000-contact experiment; the 51 quarantined contacts remain separate.
- Separate ASP runtime data and uploads under `data/asp-invest`. Prior workspace files remain recoverable in their original locations.
- The existing browser polls every four seconds. The server checks dossier file metadata and rebuilds the graph when files change. `CTX_LEAD_CORPUS_PATH` can point to a mounted corpus on another host.

## 1. Complete and harden the knowledge workflow

- [x] Reconcile every graph subject against the canonical validated CSV and all 949 Markdown files by HubSpot ID; preserve source classifications and shared-identity evidence.
- [x] Replace the dense 2D node layout with CRM-style, independently scrollable lead columns while retaining the spatial graph as an alternate view.
- [ ] Establish file update semantics: atomic pipeline publication, content hashes, generation manifests, safe deletion, rename detection and last-known-good recovery when a batch is incomplete.
- [ ] Replace polling full snapshots with file watching plus versioned change events; measure latency from a local edit to the inspector and both graph views.
- [ ] Separate immutable source fields from human annotations and agent proposals. Define override, tombstone, restoration and conflict behavior explicitly.
- [ ] Add graph detail endpoints so the graph layout loads compact metadata and the inspector retrieves full source content on demand.
- [ ] Benchmark 1,000 and 65,000 contacts for layout time, search latency, browser memory and network payloads; add grouping and level-of-detail where measurements require them.
- [ ] Separate validation inclusion, mailbox evidence, phone formatting, permission and investor qualification into distinct statuses.
- [ ] Add a dedicated quarantine view with reason, provenance and reviewed recovery actions.

Acceptance: an atomic source edit reaches the correct subject without a reload or lost selection; removed files disappear predictably; broken source batches preserve the previous usable generation; no source claim is promoted into confirmed qualification or delivery.

## 2. Organize the application around dedicated domains

Use one application shell and shared workspace context. Proposed pages:

| Menu | Dedicated page | Responsibility |
| --- | --- | --- |
| Home | `/` | Central orchestrator chat, current tasks and review requests |
| Knowledge Bank | `/knowledge` | Graph, search, evidence and dossier inspection |
| Prospects | `/prospects` | Validated cohort, filters, quarantine and prospect history |
| Investment products | `/products` | Versioned approved product facts, source PDFs and missing evidence |
| Document studio | `/documents` | Investment product PDF creation, templates, preview and revisions |
| Filing | `/files` | General filing independent of a particular client or prospect, with optional explicit associations |
| Email drafts | `/drafts` | General and prospect-linked drafting, reusable templates and review history |
| Reviews | `/reviews` | Proposed changes, ambiguous identities, claims and approvals |
| Operations | `/operations` | Ingestion runs, validation batches, sync health and audit history |
| Settings | `/settings` | Workspace membership, provider configuration, storage and integration settings |

- [ ] Agree the first release domains and naming before expanding the menu.
- [ ] Move the existing dashboard/graph/documents view state into durable routes while preserving the current visual system.
- [ ] Establish `src/features/{knowledge,prospects,products,documents,filing,drafts,orchestrator}` ownership and shared `src/lib` infrastructure.
- [ ] Define tenant/workspace, document, prospect, product, conversation, task, evidence and approval identifiers. Keep optional associations optional so general filing and drafting work without a prospect.
- [ ] Add access control, workspace isolation, audit events, retention and tested backup/restore at the repository boundary.
- [ ] Build PDF generation with approved templates, source versions, visual preview and export validation. Reuse the existing Python builders where appropriate.
- [ ] Build email drafts with editable previews, source-linked product claims and explicit draft versions. Treat sending as a separately scoped integration.

## 3. Design the central orchestrator

- [ ] Define the Home chat contract: conversation, intent, selected workspace/context, task status, citations, requested action and final result.
- [ ] Implement a server-side orchestrator with bounded tools for corpus retrieval, prospect lookup, filing, product lookup, PDF jobs and draft creation.
- [ ] Connect the existing Python RAG runtime through a documented service interface; specify request IDs, source IDs, timeouts and cancellation.
- [ ] Separate chat history from job state. Persist jobs with resumable checkpoints, idempotency keys and an event stream for UI progress.
- [ ] Route work to domain services using explicit schemas. Enforce workspace and action permissions in the backend.
- [ ] Display task progress and evidence in the main chat using the existing design system; surface review requests in both chat and Reviews.
- [ ] Define the approved product corpus, suppression behavior and CRM field mappings before enabling any consequential external actions.
- [ ] Evaluate questions, ambiguous requests, unsupported product claims, missing sources, interrupted jobs, duplicate submissions and attempts to cross workspace boundaries.

Acceptance: chat retrieves cited lead context and produces reviewable filing, PDF or draft artifacts; retries do not duplicate work; unsupported claims remain unresolved; job state survives restart.

## 4. Delivery order

1. Verify the retained cohort graph and inspector end to end.
2. Harden file synchronization and dataset reconciliation.
3. Establish routes, workspace storage and domain contracts.
4. Deliver Filing, Products, Document studio and Email drafts independently.
5. Connect those services to the Home orchestrator.
6. Run enterprise acceptance checks and agree the separate full-database and external-action rollout.
