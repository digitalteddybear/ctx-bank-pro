#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = process.env.CTX_WORKSPACE_ROOT ?? path.resolve(appDir, "../..");
const ctxRoot = path.join(workspaceRoot, "RAG");
const projectContextPath = path.join(ctxRoot, "context", "project_context.json");
const currentGenerationPath = path.join(ctxRoot, "phase1-generations", "current.json");
const handoffPath = path.join(ctxRoot, "project-ctx", "CTX_BANK_RESTART_HANDOFF.md");

const server = new McpServer({
  name: "asp-ctx-restart",
  version: "1.0.0",
});

const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

async function readText(filePath: string) {
  return readFile(filePath, "utf8");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readText(filePath)) as T;
}

async function currentGeneration() {
  const pointer = await readJson<{ generation_id: string; previous_generation_id?: string; published_at: string }>(
    currentGenerationPath,
  );
  const generationPath = path.join(ctxRoot, "phase1-generations", pointer.generation_id);
  const [manifest, decisionPack, scaleBenchmark] = await Promise.all([
    readJson<Record<string, unknown>>(path.join(generationPath, "generation-manifest.json")),
    readText(path.join(generationPath, "phase1-decision-pack.md")),
    readJson<Record<string, unknown>>(path.join(generationPath, "scale-benchmark.json")).catch(() => null),
  ]);
  return { pointer, generationPath, manifest, decisionPack, scaleBenchmark };
}

function compactProjectContext(context: Record<string, unknown>) {
  return {
    schema_version: context.schema_version,
    project: context.project,
    client: context.client,
    mission: context.mission,
    scope: context.scope,
    architecture: context.architecture,
    requirements: context.requirements,
    risks: context.risks,
    open_questions: context.open_questions,
    next_actions: context.next_actions,
    implementation_state: context.implementation_state,
    last_updated: context.last_updated,
  };
}

server.registerTool(
  "get_restart_handoff",
  {
    title: "Get ASP CTX restart handoff",
    description:
      "Read the current coding-agent restart handoff, including completed work, safety boundaries, primary files and open work.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const [handoff, generation] = await Promise.all([readText(handoffPath), currentGeneration()]);
    return result(`${handoff}\n\n## Live generation pointer\n\n${JSON.stringify(generation.pointer, null, 2)}\n`);
  },
);

server.registerTool(
  "get_project_context",
  {
    title: "Get project context",
    description:
      "Return the machine-readable project state in a compact form. Contact-level raw and derived corpora are intentionally excluded.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(compactProjectContext(await readJson<Record<string, unknown>>(projectContextPath))),
);

server.registerTool(
  "get_phase1_status",
  {
    title: "Get Phase 1 status",
    description:
      "Return the active generation, decision pack, scale benchmark and current publication boundaries.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const generation = await currentGeneration();
    return result({
      pointer: generation.pointer,
      manifest: generation.manifest,
      scale_benchmark: generation.scaleBenchmark,
      decision_pack: generation.decisionPack,
    });
  },
);

server.registerTool(
  "search_project_context",
  {
    title: "Search project context",
    description:
      "Search bounded project-memory documents for a term. This intentionally excludes raw contact data, derived contact JSON and RAG dossiers.",
    inputSchema: {
      query: z.string().min(2).max(160),
      limit: z.number().int().min(1).max(20).default(8),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, limit }) => {
    const generation = await currentGeneration();
    const files = [
      handoffPath,
      path.join(ctxRoot, "project-ctx", "CTX_BANK_PROJECT_MEMORY_PROTOCOL.md"),
      path.join(ctxRoot, "project-ctx", "CTX_BANK_PHASE_1_ROADMAP.md"),
      path.join(generation.generationPath, "phase1-decision-pack.md"),
    ];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches: Array<{ file: string; line: number; excerpt: string }> = [];
    for (const file of files) {
      const lines = (await readText(file)).split(/\r?\n/);
      lines.forEach((line, index) => {
        const lower = line.toLowerCase();
        if (terms.every((term) => lower.includes(term))) {
          matches.push({ file: path.relative(workspaceRoot, file), line: index + 1, excerpt: line.trim().slice(0, 600) });
        }
      });
    }
    return result({ query, matches: matches.slice(0, limit) });
  },
);

const resources = [
  ["restart-handoff", "asp://ctx/restart-handoff", "Current coding-agent restart handoff"],
  ["memory-protocol", "asp://ctx/memory-protocol", "Project memory and evidence rules"],
  ["phase1-decision-pack", "asp://ctx/phase1-decision-pack", "Current Phase 1 decision pack"],
] as const;

for (const [name, uri, description] of resources) {
  server.registerResource(name, uri, { description, mimeType: "text/markdown" }, async () => ({
    contents: [{
      uri,
      mimeType: "text/markdown",
      text: await readText(
        name === "restart-handoff"
          ? handoffPath
          : name === "memory-protocol"
            ? path.join(ctxRoot, "project-ctx", "CTX_BANK_PROJECT_MEMORY_PROTOCOL.md")
            : path.join((await currentGeneration()).generationPath, "phase1-decision-pack.md"),
      ),
    }],
  }));
}

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("ASP CTX restart-context MCP server running on stdio");
}

main().catch((error) => {
  console.error("Restart-context MCP server failed:", error);
  process.exit(1);
});
