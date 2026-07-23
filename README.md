# World Creators Knowledge Network

A live, provenance-aware 3D knowledge graph for navigating and operating the
World Creators knowledge base.

## Product surfaces

- Dashboard-first dark interface
- Interactive 3D semantic network
- Hybrid lexical and graph retrieval
- Node, relationship, source, and evidence inspection
- Recoverable add, edit, link, deprecate, restore, and remove actions
- Activity history and local persistence
- API routes for graph retrieval and mutation
- MCP server for agent access
- Structured ingestion from the existing World Creators corpus

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Knowledge safety

Source documents remain immutable. Graph mutations operate on derived records
and use soft deletion by default. Every record carries provenance, authority,
verification, confidence, and update metadata.

## UI attribution

Interface patterns and interaction primitives are informed by the locally
cloned MIT-licensed Untitled UI React repository. See `NOTICE.md`.
