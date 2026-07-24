import {
  AUTHORITY_LEVELS,
  EDGE_TYPES,
  NODE_STATUSES,
  NODE_TYPES,
} from "@/lib/graph/types";

export const extensionDocs = {
  release: {
    label: "Current implementation",
    reviewedOn: "24 July 2026",
    schemaVersion: "1.0",
    storage: "Local JSON files",
    syncInterval: "4 seconds",
  },
  scope: {
    provides: [
      "A read-only dashboard for graph counts, source files, ingestion state, and recent graph writes.",
      "An interactive 3D graph with node search, neighborhood traversal, typed links, and source metadata.",
      "A human upload route that extracts and chunks supported documents for agent processing.",
      "An MCP server that lets agents search, traverse, create, update, link, deprecate, remove, restore, and complete ingestion work.",
      "File-backed persistence for localhost or a stateful VPS.",
    ],
    excludes: [
      "The browser cannot create, edit, link, deprecate, remove, or restore graph records.",
      "Uploading a document does not make its extracted claims verified knowledge. An agent must parse the chunks and write derived nodes and links.",
      "The app does not train a neural network. The 3D view renders a typed knowledge graph.",
      "The app is not a static export. It requires the Next.js server and writable storage.",
    ],
  },
  workspace: [
    {
      path: "/",
      owner: "Human",
      purpose: "Review graph status, inspect nodes and links, search the graph, and upload source documents.",
    },
    {
      path: "/extension",
      owner: "Human + agent",
      purpose: "Read the build contract, operating steps, interfaces, storage paths, and repository map.",
    },
    {
      path: "mcp/server.ts",
      owner: "Agent",
      purpose: "Use the 14 MCP tools for graph retrieval, traversal, ingestion, mutation, and recovery.",
    },
    {
      path: "data/runtime-graph.json",
      owner: "Server",
      purpose: "Store the authoritative graph snapshot when file persistence is enabled.",
    },
    {
      path: "data/inbox/",
      owner: "Server",
      purpose: "Store uploaded files and their extraction, chunking, and processing records.",
    },
    {
      path: "data/generated/source-manifest.json",
      owner: "Indexer",
      purpose: "Store filebase counts, hashes, extensions, sizes, and text previews produced by npm run ingest.",
    },
  ],
  humanWorkflow: [
    "Open the dashboard and check node, link, indexed-file, and pending-document counts.",
    "Use search or the 3D graph to inspect a record, its sources, and its linked nodes.",
    "Use Upload document to submit a PDF, DOCX, TXT, Markdown, CSV, HTML, HTM, or RTF file up to 25 MB.",
    "Wait for an agent to process records marked ready_for_agent. The dashboard shows the resulting backend writes.",
  ],
  agentWorkflow: [
    {
      title: "Search before reading files",
      body: "Call search_knowledge with the task terms. Retrieve exact records with get_knowledge_node.",
    },
    {
      title: "Traverse only the required area",
      body: "Use get_neighborhood for one to three hops. Use find_knowledge_path when the connection between two records is unknown.",
    },
    {
      title: "Process uploaded documents",
      body: "Call list_ingestion_documents with ready_for_agent, then read_document_chunks in pages. Do not infer content that is absent from the chunks.",
    },
    {
      title: "Write derived knowledge",
      body: "Create or update nodes with provenance, authority, confidence, status, and tags. Link records with a typed relationship and source IDs.",
    },
    {
      title: "Close ingestion work",
      body: "Call complete_document_ingestion only after derived nodes and links exist. Include the derived node IDs and a factual summary.",
    },
    {
      title: "Use recoverable removal",
      body: "Deprecate obsolete records when history should remain visible. remove_knowledge_node soft-deletes a record and its active links; restore_knowledge_node reverses the node removal.",
    },
  ],
  mcpTools: {
    read: [
      ["search_knowledge", "Search active nodes by title, description, tag, or type.", "query, limit"],
      ["get_knowledge_node", "Return one node with provenance and integrity metadata.", "nodeId"],
      ["get_neighborhood", "Return nodes and typed links within one to three hops.", "nodeId, depth"],
      ["find_knowledge_path", "Return the shortest typed path between two nodes.", "sourceId, targetId"],
      ["get_network_metrics", "Return active-node, link, verification, provenance, conflict, and review counts.", "none"],
      ["list_ingestion_documents", "List uploaded documents and their extraction state.", "status (optional)"],
      ["read_document_chunks", "Read paginated extracted chunks from one uploaded document.", "documentId, offset, limit"],
    ],
    write: [
      ["complete_document_ingestion", "Mark a document processed and record its derived nodes.", "documentId, summary, derivedNodeIds"],
      ["add_knowledge_node", "Create a derived node. The default status is review.", "label, type, description, metadata"],
      ["update_knowledge_node", "Patch selected metadata on an existing node.", "nodeId, changed fields"],
      ["link_knowledge_nodes", "Create a typed relationship between two active nodes.", "source, target, type, metadata"],
      ["deprecate_knowledge_node", "Set a node status to deprecated.", "nodeId"],
      ["remove_knowledge_node", "Soft-delete a node and its active relationships.", "nodeId"],
      ["restore_knowledge_node", "Restore a soft-deleted node.", "nodeId"],
    ],
  },
  httpRoutes: [
    ["GET", "/api/graph", "Return the current graph snapshot."],
    ["GET", "/api/graph?query={term}", "Search active graph records."],
    ["GET", "/api/graph?nodeId={id}&depth={1-3}", "Return one node and its neighborhood."],
    ["POST", "/api/graph", "Agent-authenticated node or link creation."],
    ["PATCH / DELETE", "/api/graph/{id}", "Agent-authenticated node update or soft deletion."],
    ["POST", "/api/graph/{id}/restore", "Agent-authenticated node restoration."],
    ["GET / POST", "/api/documents", "List uploads or submit one human-provided document."],
    ["GET", "/api/health", "Return service state, persistence mode, and graph metrics."],
    ["GET", "/api/status", "Return corpus counts and ingestion counts."],
  ],
  configuration: [
    ["GRAPH_PERSISTENCE", "file", "Use file persistence. Set memory only for disposable runs."],
    ["GRAPH_RUNTIME_PATH", "data/runtime-graph.json", "Override the graph snapshot path with an absolute writable path."],
    ["INGESTION_ROOT", "data/inbox", "Override the uploaded-file and ingestion-record directory."],
    ["AGENT_WRITE_TOKEN", "unset", "Enable authenticated HTTP graph writes. MCP writes do not use this token."],
  ],
  repository: [
    ["src/app/", "Next.js routes, APIs, global tokens, and the /extension page."],
    ["src/components/network/", "Dashboard, graph, inspector, search, upload, and synchronization UI."],
    ["src/lib/graph/", "Graph types, seed data, search, traversal, metrics, palette, and client state."],
    ["src/lib/server/", "Graph persistence, document extraction, authorization, and validation."],
    ["mcp/server.ts", "Agent tool definitions and handlers."],
    ["scripts/", "Corpus indexing and API, MCP, live-sync, and browser QA."],
    ["src/content/extension-docs.ts", "All editable documentation copy and reference tables for this page."],
  ],
  commands: [
    ["npm run dev", "Start the development server."],
    ["npm run build", "Create the production build."],
    ["npm start", "Run the production build."],
    ["npm --silent run mcp", "Start the MCP server over stdio."],
    ["npm run ingest", "Rebuild the source manifest from the configured World Creators folders."],
    ["npm test", "Run TypeScript and ESLint checks."],
    ["npm run qa:visual", "Verify dashboard, upload, search, graph, inspector, and browser errors."],
    ["npm run qa:api", "Verify authenticated HTTP mutation and recovery. Requires AGENT_WRITE_TOKEN."],
    ["npm run qa:mcp", "Verify MCP document ingestion and graph writes with isolated QA paths."],
    ["npm run qa:sync", "Verify backend writes appear in the browser without a reload."],
  ],
  model: {
    nodeTypes: NODE_TYPES,
    statuses: NODE_STATUSES,
    authority: AUTHORITY_LEVELS,
    linkTypes: EDGE_TYPES,
  },
} as const;
