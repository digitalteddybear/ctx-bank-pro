import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import process from "node:process";

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

function parsed(result: any) {
  const text = result.content?.find((item: any) => item.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

await client.connect(transport);

try {
  console.log("1. Verifying MCP Tools...");
  const toolList = await client.listTools();
  const toolNames = toolList.tools.map((t) => t.name);
  console.log("Found tools:", toolNames);

  const requiredTools = [
    "get_ctx_bank_overview",
    "get_agent_fleet_spec",
    "get_oaas_model_guide",
    "get_compliance_matrix",
    "get_crm_zero_trust_matrix",
    "query_ctx_architecture",
  ];

  for (const name of requiredTools) {
    assert.ok(toolNames.includes(name), `Missing required tool: ${name}`);
  }

  // Test tool 1: get_ctx_bank_overview
  const overview = parsed(
    await client.callTool({
      name: "get_ctx_bank_overview",
      arguments: {},
    }),
  );
  assert.equal(overview.reach_and_impact.enterprise_deployments, 12);
  assert.ok(overview.mission.includes("Outcome-as-a-Service"));
  console.log("✓ get_ctx_bank_overview validated (12 enterprise deployments, OaaS verified)");

  // Test tool 2: get_agent_fleet_spec for compliance_gate
  const complianceAgent = parsed(
    await client.callTool({
      name: "get_agent_fleet_spec",
      arguments: { agentName: "compliance_gate" },
    }),
  );
  assert.equal(complianceAgent.name, "Compliance Gate");
  assert.ok(complianceAgent.responsibilities.some((r: string) => r.includes("SHA-256")));
  console.log("✓ get_agent_fleet_spec validated (Compliance Gate hash-bound rule verified)");

  // Test tool 3: get_oaas_model_guide
  const oaasGuide = parsed(
    await client.callTool({
      name: "get_oaas_model_guide",
      arguments: {},
    }),
  );
  assert.ok(oaasGuide.key_pillars.length >= 4);
  console.log("✓ get_oaas_model_guide validated");

  // Test tool 4: query_ctx_architecture
  const arch = parsed(
    await client.callTool({
      name: "query_ctx_architecture",
      arguments: { subsystem: "sqlite-wal-singletons" },
    }),
  );
  assert.ok(arch.documentation.includes("globalThis"));
  console.log("✓ query_ctx_architecture validated (HMR persistence verified)");

  console.log("\n2. Verifying MCP Resources...");
  const resourceList = await client.listResources();
  const resourceUris = resourceList.resources.map((r) => r.uri);
  console.log("Found resources:", resourceUris);

  assert.ok(resourceUris.includes("ctx://bank/system-overview"));
  assert.ok(resourceUris.includes("ctx://bank/oaas-playbook"));

  const resourceData = await client.readResource({ uri: "ctx://bank/oaas-playbook" });
  assert.ok(resourceData.contents.length > 0);
  const content = resourceData.contents[0]; const rawText = "text" in content ? (content.text as string) : "{}"; const parsedResource = JSON.parse(rawText);
  assert.equal(parsedResource.title, "Outcome-as-a-Service (OaaS) Operating Blueprint");
  console.log("✓ Resource read validated (ctx://bank/oaas-playbook)");

  console.log("\n3. Verifying MCP Prompts...");
  const promptList = await client.listPrompts();
  const promptNames = promptList.prompts.map((p) => p.name);
  console.log("Found prompts:", promptNames);

  assert.ok(promptNames.includes("ctx_agent_system_prompt"));
  assert.ok(promptNames.includes("evaluate_outreach_compliance"));

  const generatedPrompt = await client.getPrompt({
    name: "ctx_agent_system_prompt",
    arguments: {
      agentRole: "Outreach Drafter",
      clientName: "Apex Private Wealth",
    },
  });
  assert.ok(generatedPrompt.messages.length > 0);
  assert.ok((generatedPrompt.messages[0].content as any).text.includes("TRUTH BOUNDARY"));
  console.log("✓ Prompt execution validated (ctx_agent_system_prompt)");

  console.log("\n✅ ALL CTX BANK MCP SUITE CHECKS PASSED SUCCESSFULLY!");
} finally {
  await transport.close();
}
