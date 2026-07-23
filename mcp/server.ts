#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { graphRepository } from "../src/lib/server/persistent-repository";
import { documentRepository } from "../src/lib/server/document-repository";
import {
  AUTHORITY_LEVELS,
  EDGE_TYPES,
  NODE_STATUSES,
  NODE_TYPES,
} from "../src/lib/graph/types";

const server = new McpServer({
  name: "world-creators-knowledge-network",
  version: "1.0.0",
});

const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

server.registerTool(
  "search_knowledge",
  {
    title: "Search World Creators knowledge",
    description:
      "Search active World Creators knowledge by title, description, topic, or node type.",
    inputSchema: {
      query: z.string().describe("Natural-language or exact-term query"),
      limit: z.number().int().min(1).max(50).default(12),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, limit }) => result(await graphRepository.search(query, limit)),
);

server.registerTool(
  "get_knowledge_node",
  {
    title: "Get knowledge node",
    description: "Retrieve a complete knowledge node including provenance and integrity metadata.",
    inputSchema: { nodeId: z.string() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ nodeId }) => {
    const node = await graphRepository.node(nodeId);
    return result(node ?? { error: "Node not found", nodeId });
  },
);

server.registerTool(
  "get_neighborhood",
  {
    title: "Traverse a node neighborhood",
    description: "Retrieve nodes and typed relationships within one to three hops of a node.",
    inputSchema: {
      nodeId: z.string(),
      depth: z.number().int().min(1).max(3).default(1),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ nodeId, depth }) => result(await graphRepository.neighborhood(nodeId, depth)),
);

server.registerTool(
  "find_knowledge_path",
  {
    title: "Find shortest knowledge path",
    description: "Find the shortest typed relationship path between two knowledge nodes.",
    inputSchema: {
      sourceId: z.string(),
      targetId: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ sourceId, targetId }) =>
    result((await graphRepository.path(sourceId, targetId)) ?? { path: null }),
);

server.registerTool(
  "get_network_metrics",
  {
    title: "Get network health",
    description: "Return active-node, relationship, verification, provenance, and review metrics.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(await graphRepository.metrics()),
);

server.registerTool(
  "list_ingestion_documents",
  {
    title: "List uploaded documents",
    description:
      "List documents uploaded by a human, including extraction status, source-node identity, and RAG chunk count.",
    inputSchema: {
      status: z.enum(["ready_for_agent", "processed", "failed"]).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ status }) => {
    const documents = await documentRepository.list();
    return result(
      documents
        .filter((document) => !status || document.status === status)
        .map(({ chunks, ...document }) => ({ ...document, chunkCount: chunks.length })),
    );
  },
);

server.registerTool(
  "read_document_chunks",
  {
    title: "Read uploaded document chunks",
    description:
      "Read extraction-ready RAG chunks from an uploaded document before deriving or updating graph knowledge.",
    inputSchema: {
      documentId: z.string(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(25).default(8),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ documentId, offset, limit }) => {
    const document = await documentRepository.get(documentId);
    if (!document) return result({ error: "Document not found", documentId });
    return result({
      document: {
        id: document.id,
        originalName: document.originalName,
        status: document.status,
        sourceNodeId: document.sourceNodeId,
        extractedCharacters: document.extractedCharacters,
        chunkCount: document.chunks.length,
      },
      offset,
      chunks: document.chunks.slice(offset, offset + limit),
      hasMore: offset + limit < document.chunks.length,
    });
  },
);

server.registerTool(
  "complete_document_ingestion",
  {
    title: "Complete document ingestion",
    description:
      "Mark an uploaded document as processed after creating or updating its derived knowledge nodes and relationships.",
    inputSchema: {
      documentId: z.string(),
      summary: z.string().min(10).max(2000),
      derivedNodeIds: z.array(z.string()).max(200).default([]),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ documentId, summary, derivedNodeIds }) =>
    result(
      (await documentRepository.complete(documentId, { summary, derivedNodeIds })) ?? {
        error: "Document not found",
        documentId,
      },
    ),
);

server.registerTool(
  "add_knowledge_node",
  {
    title: "Add knowledge node",
    description:
      "Create a new derived knowledge node. New agent-created nodes default to review status.",
    inputSchema: {
      label: z.string().min(2).max(160),
      type: z.enum(NODE_TYPES),
      description: z.string().min(10).max(4000),
      status: z.enum(NODE_STATUSES).default("review"),
      authority: z.enum(AUTHORITY_LEVELS).default("agent-generated"),
      confidence: z.number().min(0).max(1).default(0.7),
      tags: z.array(z.string()).max(30).default([]),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (input) => result(await graphRepository.addNode(input, "MCP agent")),
);

server.registerTool(
  "update_knowledge_node",
  {
    title: "Update knowledge node",
    description: "Update selected metadata on an existing knowledge node.",
    inputSchema: {
      nodeId: z.string(),
      label: z.string().min(2).max(160).optional(),
      description: z.string().min(10).max(4000).optional(),
      status: z.enum(NODE_STATUSES).optional(),
      authority: z.enum(AUTHORITY_LEVELS).optional(),
      confidence: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).max(30).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ nodeId, ...patch }) =>
    result((await graphRepository.updateNode(nodeId, patch, "MCP agent")) ?? { error: "Node not found" }),
);

server.registerTool(
  "link_knowledge_nodes",
  {
    title: "Create knowledge relationship",
    description: "Create a typed, provenance-capable relationship between two active nodes.",
    inputSchema: {
      source: z.string(),
      target: z.string(),
      type: z.enum(EDGE_TYPES),
      description: z.string().max(1000).optional(),
      strength: z.number().min(0).max(1).default(0.75),
      verified: z.boolean().default(false),
      sourceIds: z.array(z.string()).max(30).default([]),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (input) =>
    result(
      (await graphRepository.addLink(input, "MCP agent")) ?? {
        error: "Relationship is invalid, duplicated, or references missing nodes",
      },
    ),
);

server.registerTool(
  "deprecate_knowledge_node",
  {
    title: "Deprecate knowledge node",
    description:
      "Mark a knowledge node as deprecated without deleting it or severing its provenance.",
    inputSchema: { nodeId: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ nodeId }) =>
    result((await graphRepository.deprecateNode(nodeId, "MCP agent")) ?? { error: "Node not found" }),
);

server.registerTool(
  "remove_knowledge_node",
  {
    title: "Soft-delete knowledge node",
    description:
      "Recoverably remove a node and its active relationships. Source files are never deleted.",
    inputSchema: { nodeId: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ nodeId }) =>
    result((await graphRepository.softDeleteNode(nodeId, "MCP agent")) ?? { error: "Node not found" }),
);

server.registerTool(
  "restore_knowledge_node",
  {
    title: "Restore knowledge node",
    description: "Restore a recoverably removed knowledge node.",
    inputSchema: { nodeId: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ nodeId }) =>
    result((await graphRepository.restoreNode(nodeId, "MCP agent")) ?? { error: "Node not found" }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("World Creators Knowledge Network MCP server running on stdio");
}

main().catch((error) => {
  console.error("MCP server failed:", error);
  process.exit(1);
});
