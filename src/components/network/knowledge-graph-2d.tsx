"use client";

import {
  Focus,
  LocateFixed,
  Minus,
  Network,
  Plus,
  Route,
  Rows3,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createNetronGraphRecords } from "@/lib/graph/netron-adapter";
import { findShortestPath, getNeighborhood } from "@/lib/graph/engine";
import { nodeTypeColors, nodeTypeLabels } from "@/lib/graph/palette";
import { useGraphStore } from "@/lib/graph/store";
import { Edge, Graph, Node } from "@/vendor/netron/grapher.js";
import styles from "./knowledge-graph-2d.module.css";

type Direction = "horizontal" | "vertical";

interface CanvasSize {
  width: number;
  height: number;
}

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

export function KnowledgeGraph2D() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const originRef = useRef<SVGGElement>(null);
  const nodeElementsRef = useRef(new Map<string, SVGGElement>());
  const edgeElementsRef = useRef(new Map<string, SVGPathElement>());
  const canvasSizeRef = useRef<CanvasSize>({ width: 1200, height: 760 });
  const pathStartRef = useRef<string | null>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const highlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHighlightedNodes = useGraphStore((state) => state.setHighlightedNodes);
  const [direction, setDirection] = useState<Direction>("horizontal");
  const [neighborhoodOnly, setNeighborhoodOnly] = useState(false);
  const [pathStartId, setPathStartId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 1200, height: 760 });
  const [ready, setReady] = useState(false);
  const [panning, setPanning] = useState(false);

  const visibleNodeIds = useMemo(() => {
    if (!neighborhoodOnly || !selectedNodeId) return undefined;
    return new Set(getNeighborhood(snapshot, selectedNodeId, 1).nodes.map((node) => node.id));
  }, [neighborhoodOnly, selectedNodeId, snapshot]);

  const records = useMemo(
    () => createNetronGraphRecords(snapshot, visibleNodeIds),
    [snapshot, visibleNodeIds],
  );

  useEffect(() => {
    pathStartRef.current = pathStartId;
  }, [pathStartId]);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  const fitGraph = useCallback((size = canvasSizeRef.current, minimumZoom = 0.2) => {
    const viewport = viewportRef.current;
    if (!viewport || !size.width || !size.height) return;
    const nextZoom = Math.min(
      1.15,
      Math.max(
        minimumZoom,
        Math.min(
          (viewport.clientWidth - 32) / size.width,
          (viewport.clientHeight - 32) / size.height,
        ),
      ),
    );
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollTo({
        left: Math.max(0, ((size.width * nextZoom) - viewport.clientWidth) / 2),
        top: Math.max(0, ((size.height * nextZoom) - viewport.clientHeight) / 2),
      });
    });
  }, []);

  const activateNode = useCallback((nodeId: string) => {
    const pathStart = pathStartRef.current;
    if (pathStart && pathStart !== nodeId) {
      const path = findShortestPath(snapshot, pathStart, nodeId);
      setHighlightedNodes(path?.nodes.map((node) => node.id) ?? [pathStart, nodeId]);
      setPathStartId(null);
    } else {
      setHighlightedNodes([]);
    }
    selectNode(nodeId);
  }, [selectNode, setHighlightedNodes, snapshot]);

  useEffect(() => {
    const svg = svgRef.current;
    const origin = originRef.current;
    if (!svg || !origin) return;
    let cancelled = false;
    setReady(false);
    origin.replaceChildren();
    nodeElementsRef.current.clear();
    edgeElementsRef.current.clear();

    const render = async () => {
      const graph = new Graph(false);
      graph.identifier = "world-creators-knowledge";
      graph.options = { direction };
      const renderNodes = new Map<string, Node>();

      for (const record of records.nodes) {
        const node = new Node();
        node.name = record.id;
        node.id = `knowledge-node-${safeId(record.id)}`;
        node.class = `knowledge-node knowledge-node-type-${record.type}`;
        const header = node.header();
        const title = header.add(`knowledge-title-${safeId(record.id)}`, [
          "knowledge-node-title",
          `knowledge-node-title-${record.type}`,
        ]);
        title.content = record.shortLabel;
        title.tooltip = record.label;
        title.on("click", () => activateNode(record.id));

        const metadata = node.list();
        const type = metadata.argument("type", nodeTypeLabels[record.type]);
        type.separator = "  ";
        metadata.add(type);
        const status = metadata.argument("status", record.status.replaceAll("_", " "));
        status.separator = "  ";
        metadata.add(status);
        const links = metadata.argument("links", String(record.linkCount));
        links.separator = "  ";
        metadata.add(links);
        const sources = metadata.argument("sources", String(record.sourceCount));
        sources.separator = "  ";
        metadata.add(sources);
        metadata.on("click", () => activateNode(record.id));
        graph.setNode(node);
        renderNodes.set(record.id, node);
      }

      for (const record of records.edges) {
        const source = renderNodes.get(record.source);
        const target = renderNodes.get(record.target);
        if (!source || !target) continue;
        const edge = new Edge(source, target);
        edge.v = source.name;
        edge.w = target.name;
        edge.name = record.id;
        edge.id = `knowledge-link-${safeId(record.id)}`;
        edge.class = `knowledge-edge knowledge-edge-${record.type}`;
        edge.label = record.label;
        edge.activate = () => {
          setHighlightedNodes([record.source, record.target]);
          selectNode(record.target);
        };
        graph.setEdge(edge);
      }

      graph.build(document, origin);
      await graph.measure();
      await graph.layout();
      if (cancelled) return;
      graph.update();

      const margin = 80;
      const width = Math.max(360, Math.ceil((graph.width ?? 0) + margin * 2));
      const height = Math.max(320, Math.ceil((graph.height ?? 0) + margin * 2));
      origin.setAttribute(
        "transform",
        `translate(${margin - (graph.originX ?? 0)},${margin - (graph.originY ?? 0)})`,
      );
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      const orderedIds = records.nodes.map((record) => record.id);
      records.nodes.forEach((record, index) => {
        const node = renderNodes.get(record.id);
        if (!node?.element) return;
        const element = node.element;
        element.dataset.nodeId = record.id;
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.setAttribute(
          "aria-label",
          `${record.label}. ${nodeTypeLabels[record.type]}. ${record.status.replaceAll("_", " ")}.`,
        );
        element.style.setProperty("--node-color", nodeTypeColors[record.type]);
        element.addEventListener("click", () => activateNode(record.id));
        element.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateNode(record.id);
          }
          if (event.key === "ArrowRight" || event.key === "ArrowDown" ||
              event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
            const nextId = orderedIds[(index + delta + orderedIds.length) % orderedIds.length];
            const next = nodeElementsRef.current.get(nextId);
            next?.focus();
            next?.scrollIntoView({ block: "center", inline: "center" });
          }
        });
        nodeElementsRef.current.set(record.id, element);
      });

      for (const record of records.edges) {
        const entry = graph.edge(record.source, record.target, record.id);
        if (!entry?.label.element) continue;
        entry.label.element.dataset.linkId = record.id;
        entry.label.element.setAttribute(
          "aria-label",
          `${record.label}: ${record.source} to ${record.target}`,
        );
        edgeElementsRef.current.set(record.id, entry.label.element);
      }

      setCanvasSize({ width, height });
      setReady(true);
      requestAnimationFrame(() => fitGraph({ width, height }, 0.48));
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [
    activateNode,
    direction,
    fitGraph,
    records,
    selectNode,
    setHighlightedNodes,
  ]);

  useEffect(() => {
    const highlighted = new Set(highlightedNodeIds);
    nodeElementsRef.current.forEach((element, id) => {
      element.classList.toggle("select", id === selectedNodeId);
      element.classList.toggle("is-highlighted", highlighted.has(id));
      element.classList.toggle("is-dimmed", highlighted.size > 0 && !highlighted.has(id));
    });
    const highlightedEdges = new Set(
      records.edges
        .filter((edge) => highlighted.has(edge.source) && highlighted.has(edge.target))
        .map((edge) => edge.id),
    );
    edgeElementsRef.current.forEach((element, id) => {
      element.classList.toggle("select", highlightedEdges.has(id));
      element.classList.toggle(
        "is-dimmed-edge",
        highlighted.size > 0 && !highlightedEdges.has(id),
      );
    });
  }, [highlightedNodeIds, records.edges, selectedNodeId]);

  useEffect(() => {
    if (!ready || !selectedNodeId) return;
    const element = nodeElementsRef.current.get(selectedNodeId);
    if (!element) return;
    setZoom((value) => Math.max(value, 0.78));
    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      element.focus({ preventScroll: true });
    });
  }, [ready, selectedNodeId]);

  const changeZoom = (factor: number) => {
    setZoom((value) => Math.min(1.8, Math.max(0.2, value * factor)));
  };

  const startPath = () => {
    if (!selectedNodeId) return;
    setPathStartId(selectedNodeId);
    setHighlightedNodes([selectedNodeId]);
  };

  return (
    <div className={styles.root} data-testid="knowledge-graph-2d">
      {!ready && <div className={styles.loading}>Laying out knowledge map</div>}
      <div
        className={styles.viewport}
        ref={viewportRef}
        data-panning={panning}
        onPointerDown={(event) => {
          if (event.button !== 0 || !viewportRef.current) return;
          if (
            event.target instanceof Element &&
            event.target.closest(
              "[data-node-id], [data-link-id], .edge-paths-hit-test, .edge-labels",
            )
          ) return;
          panRef.current = {
            x: event.clientX,
            y: event.clientY,
            left: viewportRef.current.scrollLeft,
            top: viewportRef.current.scrollTop,
          };
          setPanning(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = panRef.current;
          const viewport = viewportRef.current;
          if (!start || !viewport) return;
          viewport.scrollLeft = start.left - (event.clientX - start.x);
          viewport.scrollTop = start.top - (event.clientY - start.y);
        }}
        onPointerUp={(event) => {
          panRef.current = null;
          setPanning(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          changeZoom(event.deltaY < 0 ? 1.08 : 0.92);
        }}
      >
        <svg
          className={styles.canvas}
          ref={svgRef}
          width={canvasSize.width * zoom}
          height={canvasSize.height * zoom}
          aria-label="World Creators two-dimensional knowledge map"
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            selectNode(null);
            setHighlightedNodes([]);
          }}
        >
          <g ref={originRef} />
        </svg>
      </div>

      <div className={styles.toolbar} aria-label="Knowledge map controls">
        <button type="button" title="Fit graph" aria-label="Fit graph" onClick={() => fitGraph()}>
          <LocateFixed size={15} />
        </button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => changeZoom(0.85)}>
          <Minus size={15} />
        </button>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => changeZoom(1.15)}>
          <Plus size={15} />
        </button>
        <span className={styles.toolbarDivider} />
        <button
          type="button"
          title="Change layout direction"
          aria-label="Change layout direction"
          data-active={direction === "vertical"}
          onClick={() => setDirection((value) => value === "horizontal" ? "vertical" : "horizontal")}
        >
          <Rows3 size={15} />
        </button>
        <button
          type="button"
          title="Show selected node and one-hop neighbors"
          aria-label="Focus one-hop neighborhood"
          data-active={neighborhoodOnly}
          disabled={!selectedNodeId}
          onClick={() => setNeighborhoodOnly((value) => !value)}
        >
          <Focus size={15} />
        </button>
        <button
          type="button"
          title={pathStartId ? "Select a destination node" : "Start a shortest path from selected node"}
          aria-label={pathStartId ? "Waiting for path destination" : "Start shortest path"}
          data-active={Boolean(pathStartId)}
          disabled={!selectedNodeId}
          onClick={startPath}
        >
          <Route size={15} />
        </button>
      </div>

      <div className={styles.modeStatus}>
        <i />
        <Network size={12} />
        {pathStartId
          ? "Select a destination"
          : `${records.nodes.length} nodes · ${records.edges.length} links · ${direction}`}
      </div>
    </div>
  );
}
