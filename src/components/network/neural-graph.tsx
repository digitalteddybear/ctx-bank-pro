"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphMethods, LinkObject, NodeObject } from "react-force-graph-3d";
import { nodeTypeColors } from "@/lib/graph/palette";
import type { KnowledgeLink, KnowledgeNode } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/store";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
}) as unknown as typeof import("react-force-graph-3d").default;

type RenderNodeData = KnowledgeNode & {
  color: string;
  val: number;
};

type RenderLinkData = Omit<KnowledgeLink, "source" | "target">;
type RenderNode = NodeObject<RenderNodeData>;
type RenderLink = LinkObject<RenderNodeData, RenderLinkData>;

function endpointId(endpoint: string | number | RenderNode | undefined) {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

export function NeuralGraph({
  compact = false,
  onReady,
}: {
  compact?: boolean;
  onReady?: () => void;
}) {
  const graphRef = useRef<
    | ForceGraphMethods<
        NodeObject<RenderNodeData>,
        LinkObject<RenderNodeData, RenderLinkData>
      >
    | undefined
  >(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  const [ready, setReady] = useState(false);
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const highlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHighlightedNodes = useGraphStore((state) => state.setHighlightedNodes);

  const activeNodeIds = useMemo(
    () => new Set(snapshot.nodes.filter((node) => !node.deletedAt).map((node) => node.id)),
    [snapshot.nodes],
  );

  const graphData = useMemo(() => {
    const highlighted = new Set(highlightedNodeIds);
    const nodes: RenderNode[] = snapshot.nodes
      .filter((node) => !node.deletedAt)
      .map((node) => {
        const isSelected = selectedNodeId === node.id;
        const isDimmed = highlighted.size > 0 && !highlighted.has(node.id);
        return {
          ...node,
          color: isDimmed ? "#303746" : nodeTypeColors[node.type],
          val: isSelected ? 8 : node.type === "organization" ? 7 : node.type === "source" ? 3 : 5,
        };
      });

    const links: RenderLink[] = snapshot.links
      .filter(
        (item) =>
          !item.deletedAt && activeNodeIds.has(item.source) && activeNodeIds.has(item.target),
      )
      .map((item) => ({ ...item }));

    return { nodes, links };
  }, [activeNodeIds, highlightedNodeIds, selectedNodeId, snapshot.links, snapshot.nodes]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(320, rect.width), height: Math.max(320, rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !graphRef.current) return;
    const controls = graphRef.current.controls() as {
      autoRotate?: boolean;
      autoRotateSpeed?: number;
      enableDamping?: boolean;
      dampingFactor?: number;
    };
    if (controls) {
      controls.autoRotate = !compact;
      controls.autoRotateSpeed = 0.32;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
    }
  }, [compact, ready]);

  useEffect(() => {
    if (ready) return;
    const fallback = window.setTimeout(() => {
      setReady(true);
      graphRef.current?.zoomToFit(500, compact ? 36 : 64);
      onReady?.();
    }, compact ? 1_600 : 2_000);
    return () => window.clearTimeout(fallback);
  }, [compact, onReady, ready]);

  useEffect(() => {
    if (!selectedNodeId || !graphRef.current) return;
    const node = graphData.nodes.find((item) => item.id === selectedNodeId);
    if (!node || node.x === undefined || node.y === undefined || node.z === undefined) return;

    const distance = compact ? 150 : 300;
    const ratio = 1 + distance / Math.hypot(node.x, node.y, node.z);
    graphRef.current.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      { x: node.x, y: node.y, z: node.z },
      700,
    );
  }, [compact, graphData.nodes, ready, selectedNodeId]);

  return (
    <div className="neural-graph" ref={containerRef}>
      {!ready && (
        <div className="graph-loading">
          <div className="graph-loading__field" />
          <span>Forming neural field</span>
        </div>
      )}
      <ForceGraph3D<RenderNodeData, RenderLinkData>
        ref={graphRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
        enableNodeDrag
        controlType="orbit"
        nodeLabel={(node) => `${node.label} · ${node.type.replaceAll("_", " ")}`}
        nodeColor={(node) => node.color}
        nodeVal={(node) => node.val}
        nodeOpacity={0.96}
        nodeResolution={compact ? 10 : 14}
        linkColor={(link) => {
          const active =
            selectedNodeId &&
            (endpointId(link.source) === selectedNodeId || endpointId(link.target) === selectedNodeId);
          return active ? "rgba(155, 139, 255, 0.82)" : "rgba(126, 147, 179, 0.22)";
        }}
        linkWidth={(link) => {
          const active =
            selectedNodeId &&
            (endpointId(link.source) === selectedNodeId || endpointId(link.target) === selectedNodeId);
          return active ? 1.15 : 0.42;
        }}
        linkOpacity={0.85}
        linkDirectionalParticles={(link) => {
          const active =
            selectedNodeId &&
            (endpointId(link.source) === selectedNodeId || endpointId(link.target) === selectedNodeId);
          return active ? 2 : 0;
        }}
        linkDirectionalParticleWidth={1.15}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => "#C4BBFF"}
        d3AlphaDecay={0.025}
        d3VelocityDecay={0.35}
        warmupTicks={compact ? 45 : 70}
        cooldownTicks={compact ? 75 : 110}
        onNodeClick={(node) => {
          selectNode(node.id);
          setHighlightedNodes([]);
        }}
        onBackgroundClick={() => {
          selectNode(null);
          setHighlightedNodes([]);
        }}
        onEngineStop={() => {
          if (!ready) {
            setReady(true);
            graphRef.current?.zoomToFit(650, compact ? 46 : 72);
            onReady?.();
          }
        }}
      />
      <div className="graph-vignette" aria-hidden="true" />
      <div className="graph-hint">
        <span className="graph-hint__mouse" />
        Drag to orbit · scroll to travel
      </div>
    </div>
  );
}
