# Phase 2 outreach backend — inside the existing CTX application

## Status and boundaries

This is a sandbox backend milestone, not a production outreach launch.
Implementation lives in `src/lib/server/outreach`, with authenticated endpoints
under `/api/agents` in this same Next.js application. No second application,
separate lead database or replacement UI was created. The existing dashboard,
Phase 1 ingestion and canonical RAG publication remain unchanged.

The Agents dashboard is pending user review of backend behaviour. Gmail,
HubSpot, Google Calendar and Cal.com adapters are deliberately NOT connected.
Messages enter a local simulated outbox; CRM updates and bookings are audit
events, not changes to external systems. The intended sender is
`dylan@aspinvest.co.uk`; the booking link is
`https://cal.com/asp-private-capital/opportunities`.

## Five specialised agents

1. Prospect Intelligence: creates an evidence-cited brief from supplied facts.
2. Outreach: drafts reactivation, follow-up and conversational responses.
3. Conversation: classifies replies and routes interest, booking requests,
   opt-outs, complaints and advice requests.
4. Deliverability: assesses legitimate inbox-readiness, message format, links,
   unsubscribe handling and provider requirements before compliance review.
5. Compliance: independently reviews the exact message against versioned
   regulatory references and ASP's introducer/liaison boundaries.

The deterministic workflow engine controls execution, not the language model.
Models cannot send mail, change CRM records or invoke tools. Every outbound
draft requires a passing compliance review. Human approval is the default and
is bound to the exact draft hash. Editing invalidates that approval. Automatic
mode requires compliance review and remains simulated for both test types.

## Phase 1 connection and real-contact sandbox

`phase1.ts` imports the app's existing `loadLeadGraph`, not an independent RAG
reader. Authenticated operators can inspect the canonical summary or dossier
through `/api/agents/phase1` and `/api/agents/phase1/{lead-id}`. A selected
profile can also be opened as a sandbox run with `create-sandbox`. The complete
retained Markdown dossier, parsed facts, provenance and validation history are
passed to the agents and retained with the run for auditability.

Sandbox runs may use actual contact details and unknown historical permission for
draft simulation. They are marked `sandbox: true`, never call Gmail or SMTP,
never write HubSpot, never create Calendar/Cal.com events, and have no external
delivery adapter. Historical validation, classification and
`phase2_outreach_ready` remain evidence only—not permission, qualification or
campaign authorisation.

## Run and verify

From `App/knowledge-network`, using Node 22.18 or later with `node:sqlite`:

```sh
npm run qa:outreach
npm run outreach:demo
npm run outreach:worker
```

The demo uses a fresh temporary SQLite database and explicit deterministic
fixtures. It prints a full synthetic initial-message → interested reply →
booking request → simulated booking-confirmation journey and audit events.
Demo approvals are scripted test approvals, NOT real operator approvals.
Its temporary database path is included in the report for inspection.

The worker is a companion process using the same app code and database, not a
separate application. Stop with Ctrl-C. Runs persist across restarts; jobs use
leases, bounded retries and event deduplication. No daemon or VPS service is
installed by these changes.

Default persistent storage: `data/generated/outreach/workflows.sqlite` (ignored
by Git). Set `CTX_OUTREACH_DB_PATH` to an absolute path for both server and worker
when needed. SQLite uses WAL; back up using SQLite-aware backup procedures.
Follow-ups are explicitly scheduled by an operator, limited to two, and cancelled
by inbound replies. A sent booking link never counts as a confirmed appointment.

## API and operator controls

Configure a secret `CTX_OUTREACH_OPERATOR_TOKEN` of at least 24 characters in the
server environment. Every request needs `Authorization: Bearer <token>`.
Without it the API fails closed. Never expose this token to public client code.

GET endpoints:

- `/api/agents`: agent queue states and global/campaign pause status.
- `/api/agents/runs`: persisted sandbox and synthetic test runs.
- `/api/agents/runs/{id}`: run, review and chronological audit events.
- `/api/agents/sources`: current source snapshots and approval metadata.
- `/api/agents/source-events`: source import/review/refresh audit events.
- `/api/agents/phase1`: read-only canonical lead summary.

POST JSON commands to `/api/agents` (see the route's strict schema for fields):

- `create`: synthetic test prospect, `syntheticAcknowledgement: true`, optional
  `mode: human|automatic` and `inference: fixture|live`.
- `create-sandbox`: actual Phase 1 dossier using `phase1LeadId: "lead-{HubSpot ID}"`
  and `sandboxAcknowledgement: true`. This is the command for real-contact
  simulation.
- `approve`: run id, exact draftHash, named actor.
- `edit`, `reject`, `pause-run`, `resume`, `followup`.
- `reply`: id, eventId, text; idempotent simulated incoming event.
- `booking`: id and simulated event with eventId, bookingId, increasing sequence,
  startsAt and status confirmed/cancelled.
- `pause`: scope global/campaign/prospect/outreach/conversation/deliverability/compliance and
  paused boolean.
- `import-source`, `approve-source`: separate snapshot and review operations.

Example creation body:

```json
{
  "action": "create",
  "syntheticAcknowledgement": true,
  "mode": "human",
  "inference": "fixture",
  "prospect": {
    "id": "synthetic-1",
    "name": "Alex Example",
    "email": "alex@example.test",
    "permission": "granted",
    "facts": [{"text": "Synthetic prospect requested information.", "source": "synthetic-profile"}]
  }
}
```

An unseeded registry holds messages; only the isolated demo seeds fixture sources.
There is no unauthenticated seed endpoint. Operator identity currently uses one
shared server-side token; per-user roles and session integration remain work for
the approved dashboard milestone. It is not a production multi-user auth system.

## Real model evaluation, still sandbox dispatch

The configurable adapter accepts a JSON chat-completions-compatible endpoint.
Set these server/worker environment variables explicitly:

- `CTX_OUTREACH_MODEL_URL`: complete HTTPS endpoint (loopback HTTP also allowed).
- `CTX_OUTREACH_MODEL_KEY`: provider key; never commit or log it.
- `CTX_OUTREACH_WRITER_MODEL`: writer, prospect and conversation model.
- `CTX_OUTREACH_COMPLIANCE_MODEL`: independently selected reviewer model.

Use `npm run outreach:worker -- --live` for live-inference runs. The API creates
them with `inference: live`. `npm run outreach:demo -- --live` requires a shared
database path containing reviewed, non-fixture sources. Sandbox contact data may
be real when live inference is explicitly configured; confirm the provider's
data-processing terms before enabling that path. Delivery remains simulated even
with real model inference.
No real-model quality or regulatory-accuracy result has been established yet.
There is no silent fallback from failed live inference to fixtures.

## Deliverability knowledge controls

The Deliverability agent is a legitimate delivery-readiness control, not a spam
filter-evasion mechanism. It uses versioned, reviewer-approved documentation
sources for Gmail sender guidelines, Yahoo Sender Hub, Microsoft email
authentication and RFC 8058. Its checks cover:

- SPF, DKIM, DMARC, alignment, TLS, DNS and reputation evidence;
- RFC-conformant message structure and sender identity;
- HTML, MIME, image, attachment, link and visible opt-out characteristics;
- provider-specific sender requirements and one-click unsubscribe expectations.

Draft-only sandbox runs cannot prove DNS, authentication, transport headers,
provider reputation or final inbox placement. Those conditions are explicitly
reported as warnings or escalations. No agent can guarantee inbox placement or
override a receiving provider's filtering decision. The source IDs are
`gmail-sender-guidelines`, `yahoo-sender-guidelines`,
`microsoft-authentication` and `rfc-8058`; the seeded versions are clearly
simulation summaries and must be replaced with reviewed source snapshots before
live model evaluation or production delivery.

## Regulatory knowledge controls

Required source IDs: `fca-promotions`, `uk-fsma21`, `ico-email`, `asp-policy`.
Import exact reviewed material through `import-source`, with source fields id,
url, title, jurisdiction, kind (`legislation`, `guidance`, `asp-policy`), text and
optional publishedAt/effectiveAt. Approval requires its exact hash and a named
reviewer. An allowlist restricts official sources to FCA, legislation.gov.uk
and ICO; ASP policy may use aspinvest.co.uk. The operator is responsible for
authenticity, completeness, applicability and effective dates of imported text.

Source text is versioned and quotations must match exact versions. Missing,
changed, unreviewed or older-than-seven-day source checks hold the workflow.
The worker attempts daily external refreshes, with hourly retry checks; extraction
failures retain the previous timestamp rather than pretending freshness.
Changed text requires new review. Internal policy requires manual revalidation.
The fixture source summaries are conspicuously simulated and cannot be used in
live inference. They are NOT retrieved legislation or legal advice.

Automatic compliance review is not legal advice, regulatory authorisation or
statutory approval of a financial promotion. Appropriate legal/compliance review
must establish the applicable promotion and direct-marketing basis before any
real outreach launch. Eligibility is never inferred from interest or wealth.

## Opportunity disclosure perimeter

Specific opportunities are NEVER disclosed until consultation:
- The outreach framework operates solely to gather interest in ASP Private Capital as private market liaisons.
- Specific deals, investment opportunities, allocations, term sheets, or return figures are never communicated prior to a live meeting or call with an ASP representative.
- The furthest outreach can go regarding opportunities is relaying general macroeconomic context across the three approved operating sectors:
  1. Managed funds
  2. Private equity
  3. Precious metals
- Deterministic Gate 2 enforces this check on every draft before compliance review.

## Sovereign foundation models & PEFT/QLoRA weight adaptation

Each of the five agents operates as a domain-sovereign foundation model instance:
- Base Foundation Model: `meta-llama/Llama-3.1-8B-Instruct`.
- Domain Adapters: Parameter-efficient fine-tuning (PEFT / QLoRA) with domain-specific LoRA rank and module targeting.
- Checkpoints are tracked in `SovereignModelRegistry` with full step-by-step loss history curves and benchmark verification records.

## Autonomous continual adaptation pipeline

1. **Interaction Harvest & Curation** (`InteractionHarvester`):
   - Extracts workflow runs, transcripts, and human edits from SQLite.
   - Filters out prompt injections and adversarial inputs before data enters the buffer.
   - Converts operator edits into Direct Preference Optimization (DPO) chosen/rejected pairs.
   - Formats approved drafts and compliant reviews into Supervised Fine-Tuning (SFT) samples.
2. **Statutory Change Detection** (`RegulatoryWatcher`):
   - Monitors content hashes of official sources (FCA, legislation, ICO, RFC).
   - Emits adaptation trigger events and generates synthetic compliance preference pairs when statutory amendments occur.
3. **Autonomous Retraining & Shadow Evaluation** (`SovereignTrainer` & `ShadowEvalGate`):
   - Trains candidate domain weights using gradient descent convergence simulation or local PyTorch/PEFT workers (`scripts/train-sovereign-agent.py`).
   - Every candidate checkpoint must pass the **200-Case Evaluation Benchmark** before being activated:
     * Unsafe-Send Rate: `0.0%`
     * Opt-Out Recall: `100.0%`
     * Escalation Recall: `100.0%`
     * Opportunity Disclosure Block: `100.0%`
     * Citation Entailment: `100.0%`

## Inter-agent communication bus & master orchestrator

- **Agent Message Bus** (`AgentMessageBus`):
  - Typed pub/sub and RPC message bus with SHA-256 cryptographic message signatures.
  - Channels: `prospect`, `outreach`, `conversation`, `deliverability`, `compliance`, `orchestrator`, and broadcast `*`.
- **Master Orchestrator** (`MasterOrchestrator`):
  - Listens for real-world development alerts (`REGULATORY_UPDATE_DETECTED`, `PROSPECT_OBJECTION_PROPAGATED`).
  - Broadcasts updated constraints across all sovereign agents.
  - Automatically triggers candidate fine-tuning cycles and coordinates consensus.

## Verification commands

From `App/knowledge-network`:

```sh
npm run qa:harvest        # Verifies prompt injection filtering, DPO synthesis, regulatory deltas
npm run qa:orchestrator   # Verifies A2A signed messaging, registry, trainer, orchestrator
npm run qa:outreach       # 24 regression tests (including Gate 2 opportunity disclosure)
npm run qa:benchmark      # 200-case evaluation benchmark across dev, test, and temporal splits
npm run typecheck         # Full TypeScript compilation check
npm run build             # Next.js Turbopack production build
```

## Remaining gates

1. Supply approved model configuration and reviewed real source snapshots;
   evaluate synthetic conversations with real models and human reviewers.
2. User approves backend behaviour, then build the Agents section inside this
   existing CTX dashboard using its existing Astryx design system.
3. Add production permissions, qualification evidence and campaign approval
   controls before allowing real Phase 1 profiles into outreach.
4. Connect Gmail, HubSpot and booking events last; validate idempotent delivery,
   reconciliation, webhook authentication and independent suppression checks.
5. Harden deployment/authentication, backup/restore, monitoring, retention and
   service supervision before VPS 24/7 operation.
