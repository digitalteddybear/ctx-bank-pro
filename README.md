# ASP Invest — CTX Bank application

A provenance-aware application displaying the Python pipeline's 949 retained
lead dossiers from ASP Invest's 1,000-contact validation sample. The remaining
51 contacts stay in the separate quarantine archive.

The graph reads `../../RAG/corpus/chunks/normalized-contacts`
relative to this application, or `CTX_LEAD_CORPUS_PATH` when configured. It
checks files on refresh and preserves the original Markdown as provenance.
The existing inspector renders readable dossier text beginning with a prospect
description. Pipeline inclusion and readiness flags do not establish confirmed
mailbox delivery, permission for outreach, or investor qualification.

ASP runtime writes and uploads live under `data/asp-invest/`. The old World
Creators data remains in its original location for recovery and is not loaded
by default. The historical seed and ingestion script are legacy reference code.

See [the enterprise task list](docs/asp-invest-enterprise-plan.md) for dedicated
application domains, file synchronization improvements and orchestrator design.

## Product surfaces

- Read-only human observability dashboard
- Deterministic 2D knowledge map with an optional 3D spatial view
- Hybrid lexical and graph retrieval
- Node, relationship, source, and evidence inspection
- Human document upload as the only frontend mutation
- Backend extraction and RAG chunking for PDF, DOCX, Markdown, text, CSV, HTML,
  and RTF
- Live frontend synchronization from the authoritative backend graph
- MCP tools for agent retrieval, traversal, ingestion, mutation, and recovery
- File persistence suitable for localhost and a stateful VPS

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The application is intentionally dynamic. It requires its Next.js server and
writable `data/` storage; it is not a static-export application.

Current operator and agent documentation is available at
`http://localhost:3000/extension`. Update the page content in
`src/content/extension-docs.ts`; `npm run qa:docs` checks its MCP tool reference
against the implemented server.

## Human and agent boundaries

Humans can upload documents through the interface. Uploads are stored under
`data/inbox`, text-extracted, chunked for retrieval, and immediately represented
as source nodes.

Agents operate the graph through the MCP server:

```bash
npm --silent run mcp
```

The MCP surface includes graph search, node retrieval, neighborhood traversal,
path finding, pending-document listing, chunk reading, knowledge creation and
updates, typed linking, deprecation, recoverable removal, restoration, and
ingestion completion.

HTTP graph writes are disabled unless `AGENT_WRITE_TOKEN` is configured. When
enabled, send the token through `x-agent-token` or `Authorization: Bearer`.
The browser never receives this token.

Optional runtime settings:

```bash
GRAPH_PERSISTENCE=file
CTX_LEAD_CORPUS_PATH=/absolute/path/to/normalized-contacts
GRAPH_RUNTIME_PATH=/absolute/path/to/asp-invest/runtime-graph.json
INGESTION_ROOT=/absolute/path/to/asp-invest/inbox
AGENT_WRITE_TOKEN=replace-with-a-long-random-secret
```

Source documents remain immutable. Derived graph mutations use soft deletion,
and every record carries provenance, authority, confidence, and update metadata.

## UI attribution

Interface patterns and interaction primitives are informed by the locally
cloned MIT-licensed Untitled UI React repository. See `NOTICE.md`.

The 2D knowledge map uses a pinned, adapted subset of Netron v9.1.8's
MIT-licensed graph renderer and Dagre layout. Only the renderer files are
vendored; Netron's model parsers and application shell are not included.
