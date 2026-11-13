# CTX Bank Pro

CTX Bank Pro is a multi-client platform for building and operating context-rich agent systems. It combines a knowledge and RAG layer, agent workflows, model configuration, and an operator workspace so teams can ground automated work in their own data and review what agents do.

CTX is developed as an outcomes-as-a-service platform. The operator reports that about a dozen companies use a tailored CTX-based system for their agent operations. CTX Bank is the shared platform; each client instance is configured for that organisation's workflows and controls. ASP Private Capital is one such instance, with outreach features specific to its operation.

## What CTX provides

- **Knowledge and RAG:** source ingestion, provenance-aware records, semantic retrieval, graph exploration, and evidence inspection.
- **Agent operations:** agent runs, inbox and escalation workflows, campaign configuration, and operational telemetry.
- **AI workspace:** persistent conversations, model and provider settings, and a workspace for generated artifacts.
- **Client-specific integrations:** APIs and workflows for systems such as HubSpot, email, and scheduling, enabled per deployment.
- **Operator controls:** review, approval, configuration, and synchronization surfaces for human-supervised workflows.

ASP outreach functionality is scoped to the ASP client instance; it is not a global policy for other CTX clients. A validated lead record is evidence of data review, not by itself permission to contact someone or confirmation of investor eligibility. Live dispatch and CRM changes require the deployment's configured controls and operator decisions.

## Current status

CTX is under active development. Recent work includes versioned campaign and demo reply templates, a shared validated HTML renderer, per-run demo template snapshots, and an external outreach service entrypoint. These are implementation milestones, not a claim that the system is ready for unrestricted production campaigns.

The current production checklist tracks the remaining work, including durable campaign dispatch and reconciliation, worker restart recovery, inbound checkpoints and conversation memory, CRM retry and reconciliation, hosted administrator authentication and secret management, Docker deployment integration, and backup, recovery, load, browser, and controlled live acceptance checks. Review [`task-logs/production-completion-checklist.md`](task-logs/production-completion-checklist.md) for the latest status. Do not use a successful typecheck or fixture test as evidence that live outreach is production-ready.

## Requirements

- Node.js and npm compatible with the versions used by the repository.
- Python 3 for the RAG evaluation and indexing utilities.
- Local writable storage for application data. The app is a server-rendered Next.js application, not a static export.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app uses server-side environment configuration. Create `.env.local` for the integrations you intend to use. Never commit credentials. Common settings include model-provider credentials, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `HUBSPOT_ACCESS_TOKEN`, and `CAL_API_KEY`; feature flags and authorization settings are deployment-specific. Keep live email dispatch and HubSpot writes disabled unless an operator is deliberately conducting an approved live test.

CTX requires administrator or guest sign-in. A fresh local instance opens first-run administrator setup; the profile is stored in persistent configuration and survives code updates. See [profile access setup](docs/profile-access.md).

## Useful commands

```bash
npm run typecheck
npm run lint
npm run qa:docs
npm run qa:auth
npm run qa:hubspot
npm run qa:outreach
npm run qa:orchestrator
npm run qa:production
npm run build
```

The QA commands cover different boundaries; passing one does not imply that all external services or a live end-to-end journey have been verified. `npm test` runs the repository's standard typecheck, lint, documentation, and Netron checks.

Operator and agent documentation is served at `/extension` and maintained in [`src/content/extension-docs.ts`](src/content/extension-docs.ts). Platform taxonomy is maintained in [`src/content/platform-taxonomy.ts`](src/content/platform-taxonomy.ts).

## Data and deployment

Runtime records, queues, and generated data are stored under the application's `data/` directory and related configured paths. Treat these as persistent state: back them up, define retention, and verify restore procedures before hosting a deployment. Do not point multiple environments at the same writable database without an explicit concurrency and recovery design.

The repository includes Docker assets under [`docker/`](docker/) and a [`compose.yaml`](compose.yaml). Review the production checklist before treating those files as a complete hosted deployment: web, worker, RAG indexing, persistent volumes, secrets, health checks, backups, and recovery must be verified together for the target server.

For ASP's lead corpus, the configured RAG source contains 949 retained Phase 1 dossiers. The corpus remains the source material for lead knowledge; HubSpot contacts are resolved by existing identifiers rather than recreated. Contact eligibility, CRM authorization, and campaign cohort selection remain separate operational decisions.

## Contribution and licensing notes

This repository is private application software. Before redistributing third-party UI or visualization code, review [`NOTICE.md`](NOTICE.md) and the applicable upstream licenses.
