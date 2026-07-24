# World Creators Knowledge Network

A dynamic, provenance-aware 3D knowledge graph that lets agents traverse and
maintain the World Creators knowledge base without repeatedly scanning the
entire filebase.

## Product surfaces

- Read-only human observability dashboard
- Interactive 3D semantic network
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
GRAPH_RUNTIME_PATH=/absolute/path/to/runtime-graph.json
INGESTION_ROOT=/absolute/path/to/persistent/inbox
AGENT_WRITE_TOKEN=replace-with-a-long-random-secret
```

Source documents remain immutable. Derived graph mutations use soft deletion,
and every record carries provenance, authority, confidence, and update metadata.

## UI attribution

Interface patterns and interaction primitives are informed by the locally
cloned MIT-licensed Untitled UI React repository. See `NOTICE.md`.
