# CTX Bank Pro — System Architecture

This document describes the **implemented** architecture of `App/knowledge-network/` (`ctx-bank-pro@0.1.0`) and its integration with `RAG/`.

## 1. Deployment & Execution Planes

1. **Experience Plane (Browser / Next.js 16 App Router)**:
   - UI built with React 19, `@astryxdesign/core`, and Zustand transient client state (`src/components/network/`, `src/app/`).
   - Closing or refreshing the browser never interrupts durable server-side workflows.
2. **Client-Sovereign Execution Plane (`src/lib/server/` + `outreach:service` + `RAG/`)**:
   - **Web Server (`web`)**: Serves Next.js App Router pages and authenticated API routes (`CTX_WORKER_MODE=external` in Docker Compose).
   - **Outreach Worker (`worker`)**: Standalone durable loop (`scripts/outreach-service.ts`) processing scheduled jobs, IMAP reply polling, Cal.com reconciliation, and CRM delivery jobs.
   - **RAG Indexer (`rag-index` / `RAG/crm_context.py`)**: Incremental vector indexing over `workflows.sqlite` (`crm_chunks` / `crm_embeddings`) with compare-and-swap revision checks.
   - **MCP Servers (`mcp/`)**: Read-only stdio servers (`server.ts`, `ctx-bank-knowledge-server.ts`, `restart-context-server.ts`).

## 2. Persistence Boundaries

| Store | Path (Default) | Purpose |
| :--- | :--- | :--- |
| Outreach & Workflow DB | `data/generated/outreach/workflows.sqlite` | Runs, durable job queue, events (`events_run_seq` indexed), outbox, regulatory sources, suppression list, settings, CRM observation chunks. |
| HubSpot Audit DB | `data/generated/outreach/hubspot_audit.sqlite` | Append-only zero-trust CRM audit trail with secret masking and SHA-256 email hashes. |
| AI Workspace DB | `data/generated/ai-workspace/workspace.sqlite` | Operator chat conversations, runs, and immutable artifact versions. |
| Knowledge Graph | `data/asp-invest/runtime-graph.json` | Persistent knowledge network nodes and typed relationships. |

## 3. Health & Readiness

- `GET /api/health`: Returns service metadata and knowledge graph metrics.
- `GET /api/ready`: Probes `workflows.sqlite` (`SELECT 1`) and returns `503` if the database is unreachable, ensuring container orchestrators do not route traffic to unready instances.
