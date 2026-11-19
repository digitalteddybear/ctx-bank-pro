import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import process from "node:process";
import { z } from "zod";

const client = new Client({
  name: "ctx-bank-mcp-qa",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: "./node_modules/.bin/tsx",
  args: ["mcp/ctx-bank-knowledge-server.ts"],
  cwd: process.cwd(),
  stderr: "pipe",
});

transport.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
});

function parsed(result: unknown): unknown {
  const response=z.object({content:z.array(z.object({type:z.string(),text:z.string().optional()}).passthrough())}).parse(result);
  const text=response.content.find(item=>item.type==='text')?.text;
  assert.ok(text, "Tool must return JSON text content");
  return JSON.parse(text);
}

await client.connect(transport);

try {
  console.log("1. Verifying MCP Tools...");
  const toolList = await client.listTools();
  const toolNames = toolList.tools.map((t) => t.name);
  console.log("Found tools:", toolNames);

  const requiredTools = [
    "get_ctx_platform_overview",
    "get_fresh_instance_orientation",
    "get_agent_operating_system",
    "get_zero_trust_architecture",
    "get_governance_and_approval_matrix",
    "get_oaas_framework",
    "query_ctx_architecture",
  ];

  for (const name of requiredTools) {
    assert.ok(toolNames.includes(name), `Missing required tool: ${name}`);
  }

  // Test tool 1: get_ctx_platform_overview
  const overview = z.object({platform:z.string(),core_engine:z.string(),ecosystem_reach:z.object({deployments:z.string()})}).parse(parsed(
    await client.callTool({
      name: "get_ctx_platform_overview",
      arguments: {},
    }),
  ));
  assert.ok(overview.platform.includes("CTX"));
  assert.ok(overview.core_engine.includes("CTX Bank"));
  assert.ok(overview.ecosystem_reach.deployments.includes("12+ enterprise"));
  console.log("✓ get_ctx_platform_overview validated (Universal CTX Bank manifest)");

  // Test tool 2: get_fresh_instance_orientation
  const orientation = z.object({bootstrapping_checklist:z.array(z.unknown())}).parse(parsed(
    await client.callTool({
      name: "get_fresh_instance_orientation",
      arguments: {},
    }),
  ));
  assert.ok(orientation.bootstrapping_checklist.length >= 5);
  console.log("✓ get_fresh_instance_orientation validated (5 onboarding phases)");

  // Test tool 3: get_agent_operating_system for Policy Auditor
  const auditor = z.object({archetype:z.string(),responsibilities:z.array(z.string())}).parse(parsed(
    await client.callTool({
      name: "get_agent_operating_system",
      arguments: { archetype: "auditor" },
    }),
  ));
  assert.ok(auditor.archetype.includes("Policy & Compliance Auditor"));
  assert.ok(auditor.responsibilities.some((r: string) => r.includes("SHA-256")));
  console.log("✓ get_agent_operating_system validated (Universal Policy Auditor archetype)");

  // Test tool 4: get_zero_trust_architecture
  const zeroTrust = z.object({core_principles:z.array(z.unknown())}).parse(parsed(
    await client.callTool({
      name: "get_zero_trust_architecture",
      arguments: {},
    }),
  ));
  assert.ok(zeroTrust.core_principles.length >= 5);
  console.log("✓ get_zero_trust_architecture validated (Zero-Trust Gateway)");

  // Test tool 5: query_ctx_architecture
  const arch = z.object({documentation:z.string()}).parse(parsed(
    await client.callTool({
      name: "query_ctx_architecture",
      arguments: { subsystem: "sqlite-wal-singletons" },
    }),
  ));
  assert.ok(arch.documentation.includes("globalThis"));
  console.log("✓ query_ctx_architecture validated (HMR persistence verified)");

  console.log("\n2. Verifying MCP Resources...");
  const resourceList = await client.listResources();
  const resourceUris = resourceList.resources.map((r) => r.uri);
  console.log("Found resources:", resourceUris);

  assert.ok(resourceUris.includes("ctx://bank/platform-manifest"));
  assert.ok(resourceUris.includes("ctx://bank/fresh-instance-orientation"));
  assert.ok(resourceUris.includes("ctx://bank/agent-os-archetypes"));
  assert.ok(resourceUris.includes("ctx://bank/zero-trust-gateway"));
  assert.ok(resourceUris.includes("ctx://bank/governance-hash-lock"));
  assert.ok(resourceUris.includes("ctx://bank/oaas-playbook"));

  const resourceData = await client.readResource({ uri: "ctx://bank/fresh-instance-orientation" });
  assert.ok(resourceData.contents.length > 0);
  const content = resourceData.contents[0];
  const rawText = "text" in content ? (content.text as string) : "{}";
  const parsedResource = JSON.parse(rawText);
  assert.equal(parsedResource.title, "CTX Bank Fresh-Instance Bootstrapping Guide for Autonomous Agents");
  console.log("✓ Resource read validated (ctx://bank/fresh-instance-orientation)");

  console.log("\n3. Verifying MCP Prompts...");
  const promptList = await client.listPrompts();
  const promptNames = promptList.prompts.map((p) => p.name);
  console.log("Found prompts:", promptNames);

  assert.ok(promptNames.includes("bootstrap_fresh_agent"));
  assert.ok(promptNames.includes("audit_proposed_action"));
  assert.ok(promptNames.includes("assess_instance_launch_readiness"));

  const generatedPrompt = await client.getPrompt({
    name: "bootstrap_fresh_agent",
    arguments: {
      agentArchetype: "Action Drafter",
      tenantOrganizationName: "Apex Logistics Group",
      operationalDomain: "Supply Chain & Freight Billing",
    },
  });
  const firstContent = generatedPrompt.messages[0]?.content;
  const promptText = typeof firstContent === "object" && firstContent !== null && "text" in firstContent && typeof firstContent.text === "string" ? firstContent.text : "";
  assert.ok(promptText.includes("Apex Logistics Group"));
  assert.ok(promptText.includes("Supply Chain & Freight Billing"));
  assert.ok(promptText.includes("TRUTH BOUNDARY"));
  console.log("✓ Prompt execution validated (bootstrap_fresh_agent with universal tenant parameterization)");

  console.log("\n✅ ALL UNIVERSAL CTX BANK MCP CHECKS PASSED SUCCESSFULLY!");
} finally {
  await transport.close();
}
