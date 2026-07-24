import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { Edge, Graph, Node } from "../src/vendor/netron/grapher.js";

const createGraph = (nodeIds, edgeRecords) => {
  const graph = new Graph(false);
  graph.options = { direction: "horizontal" };
  const nodes = new Map();

  for (const id of nodeIds) {
    const node = new Node();
    node.name = id;
    node.width = 156;
    node.height = 52;
    graph.setNode(node);
    nodes.set(id, node);
  }

  for (const record of edgeRecords) {
    const edge = new Edge(nodes.get(record.source), nodes.get(record.target));
    edge.v = record.source;
    edge.w = record.target;
    edge.name = record.id;
    graph.setEdge(edge);
  }

  return graph;
};

const assertLaidOut = (graph, expectedNodeCount, expectedEdgeCount) => {
  assert.equal(graph.nodes.size, expectedNodeCount);
  assert.equal(graph.edges.size, expectedEdgeCount);

  for (const { label } of graph.nodes.values()) {
    assert.ok(Number.isFinite(label.x), `Node ${label.name} has no finite x coordinate.`);
    assert.ok(Number.isFinite(label.y), `Node ${label.name} has no finite y coordinate.`);
  }

  for (const { label } of graph.edges.values()) {
    assert.ok(Array.isArray(label.points), `Edge ${label.name} has no routed points.`);
    assert.ok(label.points.length >= 2, `Edge ${label.name} has an incomplete route.`);
    assert.ok(
      label.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
      `Edge ${label.name} has a non-finite route.`,
    );
  }
};

const runLayoutCase = async (name, nodeIds, edgeRecords) => {
  const graph = createGraph(nodeIds, edgeRecords);
  const startedAt = performance.now();
  await graph.layout();
  const durationMs = Math.round(performance.now() - startedAt);
  assertLaidOut(graph, nodeIds.length, edgeRecords.length);
  return { name, nodes: nodeIds.length, edges: edgeRecords.length, durationMs };
};

const parallelGraph = createGraph(
  ["parallel-a", "parallel-b"],
  [
    { id: "parallel-primary", source: "parallel-a", target: "parallel-b" },
    { id: "parallel-secondary", source: "parallel-a", target: "parallel-b" },
  ],
);
assert.equal(parallelGraph.edges.size, 2);
assert.equal(
  parallelGraph.edge("parallel-a", "parallel-b", "parallel-primary")?.label.name,
  "parallel-primary",
);
assert.equal(
  parallelGraph.edge("parallel-a", "parallel-b", "parallel-secondary")?.label.name,
  "parallel-secondary",
);

const cycle = await runLayoutCase(
  "cycle",
  ["cycle-a", "cycle-b", "cycle-c"],
  [
    { id: "cycle-ab", source: "cycle-a", target: "cycle-b" },
    { id: "cycle-bc", source: "cycle-b", target: "cycle-c" },
    { id: "cycle-ca", source: "cycle-c", target: "cycle-a" },
  ],
);

await parallelGraph.layout();
assertLaidOut(parallelGraph, 2, 2);
const parallel = { name: "parallel", nodes: 2, edges: 2 };

const syntheticNodeIds = Array.from({ length: 1000 }, (_, index) => `synthetic-${index}`);
const syntheticEdges = syntheticNodeIds.slice(1).map((target, index) => ({
  id: `synthetic-edge-${index}`,
  source: syntheticNodeIds[index],
  target,
}));
const synthetic = await runLayoutCase("synthetic", syntheticNodeIds, syntheticEdges);

const runtimePath = new URL("../data/runtime-graph.json", import.meta.url);
const runtimeSnapshot = JSON.parse(await readFile(runtimePath, "utf8"));
const activeNodes = runtimeSnapshot.nodes.filter((node) => !node.deletedAt);
const activeNodeIds = new Set(activeNodes.map((node) => node.id));
const activeEdges = runtimeSnapshot.links.filter(
  (link) => !link.deletedAt && activeNodeIds.has(link.source) && activeNodeIds.has(link.target),
);
const runtime = await runLayoutCase(
  "runtime",
  activeNodes.map((node) => node.id),
  activeEdges.map((link) => ({
    id: link.id,
    source: link.source,
    target: link.target,
  })),
);

console.log(JSON.stringify({
  renderer: "Netron v9.1.8 grapher/dagre subset",
  parallelIdentityVerified: true,
  cases: [cycle, parallel, synthetic, runtime],
}, null, 2));

process.exitCode = 0;
