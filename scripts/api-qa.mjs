const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const agentToken = process.env.AGENT_WRITE_TOKEN;

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

const health = await request("/api/health");
if (health.status !== "healthy") throw new Error("Health endpoint did not report healthy");
const status = await request("/api/status");
if (!status.corpus || !status.ingestion) throw new Error("Status endpoint is incomplete");

const unauthorized = await fetch(`${baseUrl}/api/graph`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ kind: "node", data: {} }),
});
if (unauthorized.status !== 401 && unauthorized.status !== 403) {
  throw new Error(`Unauthenticated graph write returned ${unauthorized.status}`);
}
if (!agentToken) {
  throw new Error("AGENT_WRITE_TOKEN is required to run the agent mutation lifecycle QA");
}

const agentHeaders = { "x-agent-token": agentToken };

const created = await request("/api/graph", {
  method: "POST",
  headers: agentHeaders,
  body: JSON.stringify({
    kind: "node",
    data: {
      label: "API QA Node",
      type: "concept",
      description: "A recoverable test record used to verify the graph mutation lifecycle.",
      status: "review",
      tags: ["qa", "temporary"],
    },
  }),
});

const updated = await request(`/api/graph/${created.id}`, {
  method: "PATCH",
  headers: agentHeaders,
  body: JSON.stringify({
    description: "An updated recoverable test record validating graph mutation integrity.",
    confidence: 0.88,
  }),
});
if (updated.confidence !== 0.88) throw new Error("Node update was not persisted");

const linked = await request("/api/graph", {
  method: "POST",
  headers: agentHeaders,
  body: JSON.stringify({
    kind: "link",
    data: {
      source: "world-creators",
      target: created.id,
      type: "related_to",
      verified: false,
    },
  }),
});
if (!linked.id) throw new Error("Relationship was not created");

const search = await request("/api/graph?query=API%20QA%20Node");
if (!search.results.some((result) => result.node.id === created.id)) {
  throw new Error("Created node was not retrievable through search");
}

const detail = await request(`/api/graph?nodeId=${created.id}&depth=1`);
if (!detail.neighborhood.links.some((link) => link.id === linked.id)) {
  throw new Error("Created relationship was not traversable");
}

const removed = await request(`/api/graph/${created.id}`, {
  method: "DELETE",
  headers: agentHeaders,
});
if (!removed.recoverable) throw new Error("Delete operation was not recoverable");

const restored = await request(`/api/graph/${created.id}/restore`, {
  method: "POST",
  headers: agentHeaders,
});
if (restored.deletedAt) throw new Error("Restore operation did not reactivate the node");

await request(`/api/graph/${created.id}`, {
  method: "DELETE",
  headers: agentHeaders,
});

console.log(
  JSON.stringify(
    {
      health: health.status,
      unauthenticatedWritesBlocked: true,
      created: true,
      updated: true,
      linked: true,
      searched: true,
      traversed: true,
      softDeleted: true,
      restored: true,
      testRecordFinalState: "soft-deleted",
    },
    null,
    2,
  ),
);
