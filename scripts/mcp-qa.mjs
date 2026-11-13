import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import process from "node:process";

const ingestionRoot = process.env.INGESTION_ROOT;
const graphRuntimePath = process.env.GRAPH_RUNTIME_PATH;
const documentId = process.env.QA_DOCUMENT_ID;

if (!ingestionRoot || !graphRuntimePath || !documentId) {
  throw new Error("INGESTION_ROOT, GRAPH_RUNTIME_PATH, and QA_DOCUMENT_ID are required");
}

const client = new Client({
  name: "asp-invest-mcp-qa",
  version: "1.0.0",
});
const transport = new StdioClientTransport({
  command: "./node_modules/.bin/tsx",
  args: ["mcp/server.ts"],
  cwd: process.cwd(),
  env: {
    GRAPH_RUNTIME_PATH: graphRuntimePath,
    INGESTION_ROOT: ingestionRoot,
  },
  stderr: "pipe",
});
transport.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
});

function parsed(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

await client.connect(transport);

try {
  const tools = await client.listTools();
  const requiredTools = [
    "search_knowledge",
    "get_neighborhood",
    "list_ingestion_documents",
    "read_document_chunks",
    "add_knowledge_node",
    "link_knowledge_nodes",
    "complete_document_ingestion",
  ];
  for (const name of requiredTools) {
    if (!tools.tools.some((tool) => tool.name === name)) {
      throw new Error(`Missing MCP tool: ${name}`);
    }
  }

  const documents = parsed(
    await client.callTool({
      name: "list_ingestion_documents",
      arguments: { status: "ready_for_agent" },
    }),
  );
  const document = documents.find((item) => item.id === documentId);
  if (!document) throw new Error("Uploaded document was not visible to the MCP agent");

  const chunkResult = parsed(
    await client.callTool({
      name: "read_document_chunks",
      arguments: { documentId, offset: 0, limit: 8 },
    }),
  );
  if (!chunkResult?.chunks?.length) throw new Error("No RAG chunks were available to the agent");

  const created = parsed(
    await client.callTool({
      name: "add_knowledge_node",
      arguments: {
        label: "MCP ingestion validation",
        type: "concept",
        description:
          "A temporary derived concept proving that an agent can promote uploaded evidence into graph knowledge.",
        status: "review",
        authority: "agent-generated",
        confidence: 0.72,
        tags: ["qa", "ingestion"],
      },
    }),
  );
  if (!created?.id) throw new Error("Agent did not create a derived knowledge node");

  const linked = parsed(
    await client.callTool({
      name: "link_knowledge_nodes",
      arguments: {
        source: document.sourceNodeId,
        target: created.id,
        type: "defines",
        description: "Temporary ingestion workflow validation.",
        strength: 0.8,
        verified: false,
        sourceIds: [document.id],
      },
    }),
  );
  if (!linked?.id) throw new Error("Agent did not create a source-to-knowledge relationship");

  const completed = parsed(
    await client.callTool({
      name: "complete_document_ingestion",
      arguments: {
        documentId,
        summary:
          "Validated document extraction, RAG chunk retrieval, derived knowledge creation, and graph linking.",
        derivedNodeIds: [created.id],
      },
    }),
  );
  if (completed?.status !== "processed") {
    throw new Error("Agent did not complete the ingestion record");
  }

  console.log(
    JSON.stringify(
      {
        toolCount: tools.tools.length,
        documentVisible: true,
        chunksReadable: chunkResult.chunks.length,
        derivedNodeCreated: created.id,
        relationshipCreated: linked.id,
        ingestionCompleted: true,
      },
      null,
      2,
    ),
  );
} finally {
  await transport.close();
}
