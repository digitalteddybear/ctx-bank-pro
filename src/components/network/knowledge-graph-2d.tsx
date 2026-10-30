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

interface StoredMapView {
  direction: Direction;
  zoom: number;
  offsetX?: number;
  offsetY?: number;
}

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");
const clampZoom = (value: number) => Math.min(5, Math.max(0.025, value));
const easeOut = (value: number) => 1 - (1 - value) ** 3;
const mapViewStorageKey = "ctxbankpro:knowledge-map-view:v3";
const mapMotionDuration = 260;

function readStoredMapView(): StoredMapView | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(mapViewStorageKey) ?? "null") as Partial<StoredMapView> | null;
    if (!value || (value.direction !== "horizontal" && value.direction !== "vertical")) return null;
    if (typeof value.zoom !== "number") return null;
    return value as StoredMapView;
  } catch {
    return null;
  }
}

export function KnowledgeGraph2D() {
  const [initialStoredView] = useState<StoredMapView | null>(readStoredMapView);
  const storedViewRef = useRef<StoredMapView | null>(initialStoredView);
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const originRef = useRef<SVGGElement>(null);
  const nodeElementsRef = useRef(new Map<string, SVGGElement>());
  const edgeElementsRef = useRef(new Map<string, SVGPathElement>());
  const canvasSizeRef = useRef<CanvasSize>({ width: 1200, height: 760 });
  const zoomRef = useRef(initialStoredView?.zoom ?? 1);
  const targetZoomRef = useRef(initialStoredView?.zoom ?? 1);
  const zoomAnimationRef = useRef<number | null>(null);
  const zoomAnchorRef = useRef({ x: 0, y: 0, graphX: 0, graphY: 0 });
  const pathStartRef = useRef<string | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const highlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHighlightedNodes = useGraphStore((state) => state.setHighlightedNodes);
  const [direction, setDirection] = useState<Direction>(initialStoredView?.direction ?? "horizontal");
  const [neighborhoodOnly, setNeighborhoodOnly] = useState(false);
  const [pathStartId, setPathStartId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(initialStoredView?.zoom ?? 1);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 1200, height: 760 });
  const [ready, setReady] = useState(false);
  const [viewReady, setViewReady] = useState(false);
  const viewReadyRef = useRef(false);
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

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const persistMapView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewReadyRef.current || !viewport || typeof window === "undefined") return;
    const view: StoredMapView = {
      direction,
      zoom: zoomRef.current,
      offsetX: panOffsetRef.current.x,
      offsetY: panOffsetRef.current.y,
    };
    storedViewRef.current = view;
    window.sessionStorage.setItem(mapViewStorageKey, JSON.stringify(view));
  }, [direction]);

  useEffect(() => {
    persistMapView();
  }, [direction, persistMapView]);

  const stopZoomAnimation = useCallback(() => {
    if (zoomAnimationRef.current !== null) {
      cancelAnimationFrame(zoomAnimationRef.current);
      zoomAnimationRef.current = null;
    }
  }, []);

  const animateMapView = useCallback((target: {
    zoom: number;
    offsetX: number;
    offsetY: number;
  }) => {
    const viewport = viewportRef.current;
    const svg = svgRef.current;
    if (!viewport || !svg) return;
    stopZoomAnimation();
    const startZoom = zoomRef.current;
    const startOffset = { ...panOffsetRef.current };
    const size = canvasSizeRef.current;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / mapMotionDuration);
      const eased = easeOut(progress);
      const currentZoom = startZoom + (target.zoom - startZoom) * eased;
      const offsetX = startOffset.x + (target.offsetX - startOffset.x) * eased;
      const offsetY = startOffset.y + (target.offsetY - startOffset.y) * eased;
      zoomRef.current = currentZoom;
      panOffsetRef.current = { x: offsetX, y: offsetY };
      svg.setAttribute("width", String(size.width * currentZoom));
      svg.setAttribute("height", String(size.height * currentZoom));
      svg.style.setProperty("transform", `translate(${offsetX}px, ${offsetY}px)`);
      setZoom(currentZoom);

      if (progress < 1) {
        zoomAnimationRef.current = requestAnimationFrame(step);
      } else {
        zoomAnimationRef.current = null;
        persistMapView();
      }
    };

    zoomAnimationRef.current = requestAnimationFrame(step);
  }, [persistMapView, stopZoomAnimation]);

  const animateZoomAtPoint = useCallback((requestedZoom: number, x: number, y: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const currentZoom = zoomRef.current;
    targetZoomRef.current = clampZoom(requestedZoom);
    zoomAnchorRef.current = {
      x,
      y,
      graphX: (x - panOffsetRef.current.x) / currentZoom,
      graphY: (y - panOffsetRef.current.y) / currentZoom,
    };
    stopZoomAnimation();

    const step = () => {
      const activeViewport = viewportRef.current;
      const svg = svgRef.current;
      if (!activeViewport || !svg) {
        zoomAnimationRef.current = null;
        return;
      }
      const current = zoomRef.current;
      const target = targetZoomRef.current;
      const distance = target - current;
      const nextZoom = Math.abs(distance) < 0.0005
        ? target
        : current + distance * 0.2;
      const size = canvasSizeRef.current;
      const anchor = zoomAnchorRef.current;

      zoomRef.current = nextZoom;
      svg.setAttribute("width", String(size.width * nextZoom));
      svg.setAttribute("height", String(size.height * nextZoom));
      setZoom(nextZoom);
      const offsetX = anchor.x - anchor.graphX * nextZoom;
      const offsetY = anchor.y - anchor.graphY * nextZoom;
      panOffsetRef.current = { x: offsetX, y: offsetY };
      svg.style.setProperty("transform", `translate(${offsetX}px, ${offsetY}px)`);
      if (nextZoom === target) {
        zoomAnimationRef.current = null;
        persistMapView();
      } else {
        zoomAnimationRef.current = requestAnimationFrame(step);
      }
    };

    zoomAnimationRef.current = requestAnimationFrame(step);
  }, [persistMapView, stopZoomAnimation]);

  const fitGraph = useCallback((size = canvasSizeRef.current, minimumZoom = 0.025) => {
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
    animateMapView({
      zoom: nextZoom,
      offsetX: (viewport.clientWidth - size.width * nextZoom) / 2,
      offsetY: (viewport.clientHeight - size.height * nextZoom) / 2,
    });
  }, [animateMapView]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      let delta = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= viewport.clientHeight;
      delta = Math.max(-100, Math.min(100, delta));
      const factor = Math.exp(-delta * 0.0045);
      animateZoomAtPoint(
        targetZoomRef.current * factor,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [animateZoomAtPoint]);

  useEffect(() => () => {
    if (zoomAnimationRef.current !== null) {
      cancelAnimationFrame(zoomAnimationRef.current);
    }
  }, []);

  const activateNode = useCallback((nodeId: string) => {
    const pathStart = pathStartRef.current;
    if (pathStart && pathStart !== nodeId) {
      const path = findShortestPath(snapshot, pathStart, nodeId);
      setHighlightedNodes(path?.nodes.map((node) => node.id) ?? [pathStart, nodeId]);
      setPathStartId(null);
    } else {
      setHighlightedNodes(getNeighborhood(snapshot, nodeId, 1).nodes.map((node) => node.id));
    }
    selectNode(nodeId);
  }, [selectNode, setHighlightedNodes, snapshot]);

  useEffect(() => {
    const svg = svgRef.current;
    const origin = originRef.current;
    if (!svg || !origin) return;
    let cancelled = false;
    setReady(false);
    setViewReady(false);
    viewReadyRef.current = false;
    origin.replaceChildren();
    nodeElementsRef.current.clear();
    edgeElementsRef.current.clear();

    const render = async () => {
      const graph = new Graph(false);
      graph.identifier = "asp-invest-knowledge";
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
          // Keep edge and node activation in the same focused state: the active
          // endpoint, its immediate neighbours, and the links between them.
          activateNode(record.target);
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
      const storedView = storedViewRef.current;
      requestAnimationFrame(() => {
        if (storedView) {
          zoomRef.current = clampZoom(storedView.zoom);
          targetZoomRef.current = zoomRef.current;
          svg.setAttribute("width", String(width * zoomRef.current));
          svg.setAttribute("height", String(height * zoomRef.current));
          setZoom(zoomRef.current);
          panOffsetRef.current = {
            x: storedView.offsetX ?? 0,
            y: storedView.offsetY ?? 0,
          };
          svg.style.setProperty(
            "transform",
            `translate(${panOffsetRef.current.x}px, ${panOffsetRef.current.y}px)`,
          );
        } else {
          fitGraph({ width, height }, 0.48);
        }
        setViewReady(true);
        viewReadyRef.current = true;
      });
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
    if (!ready || !viewReady || !selectedNodeId) return;
    const element = nodeElementsRef.current.get(selectedNodeId);
    const viewport = viewportRef.current;
    const svg = svgRef.current;
    if (!element || !viewport || !svg) return;
    const nextZoom = Math.max(zoomRef.current, 0.78);
    targetZoomRef.current = nextZoom;
    const nodeBounds = element.getBoundingClientRect();
    const nodeCenter = svg.createSVGPoint();
    nodeCenter.x = nodeBounds.left + nodeBounds.width / 2;
    nodeCenter.y = nodeBounds.top + nodeBounds.height / 2;
    const screenMatrix = svg.getScreenCTM();
    if (!screenMatrix) return;
    const graphPoint = nodeCenter.matrixTransform(screenMatrix.inverse());
    animateMapView({
      zoom: nextZoom,
      offsetX: viewport.clientWidth / 2 - graphPoint.x * nextZoom,
      offsetY: viewport.clientHeight / 2 - graphPoint.y * nextZoom,
    });
    element.focus({ preventScroll: true });
  }, [animateMapView, ready, viewReady, selectedNodeId]);

  const changeZoom = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    animateZoomAtPoint(
      targetZoomRef.current * factor,
      viewport.clientWidth / 2,
      viewport.clientHeight / 2,
    );
  };

  const startPath = () => {
    if (!selectedNodeId) return;
    setPathStartId(selectedNodeId);
    setHighlightedNodes([selectedNodeId]);
  };

  const clearInteraction = () => {
    setNeighborhoodOnly(false);
    setPathStartId(null);
    setHighlightedNodes([]);
    selectNode(null);
  };

  return (
    <div className={styles.root} data-testid="knowledge-graph-2d">
      {!ready && <div className={styles.loading}>Laying out knowledge map</div>}
      <div
        className={styles.viewport}
        ref={viewportRef}
        data-testid="knowledge-graph-viewport"
        data-panning={panning}
        onMouseDown={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        onClick={(event) => {
          if (suppressCanvasClickRef.current) {
            suppressCanvasClickRef.current = false;
            return;
          }
          if (
            event.target instanceof Element &&
            event.target.closest(
              "[data-node-id], [data-link-id], .edge-paths-hit-test, .edge-labels",
            )
          ) return;
          clearInteraction();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !viewportRef.current) return;
          if (
            event.target instanceof Element &&
            event.target.closest(
              "[data-node-id], [data-link-id], .edge-paths-hit-test, .edge-labels",
            )
          ) return;
          if (zoomAnimationRef.current !== null) {
            cancelAnimationFrame(zoomAnimationRef.current);
            zoomAnimationRef.current = null;
            targetZoomRef.current = zoomRef.current;
          }
          panRef.current = {
            x: event.clientX,
            y: event.clientY,
            offsetX: panOffsetRef.current.x,
            offsetY: panOffsetRef.current.y,
          };
          setPanning(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = panRef.current;
          const viewport = viewportRef.current;
          if (!start || !viewport) return;
          const deltaX = event.clientX - start.x;
          const deltaY = event.clientY - start.y;
          panOffsetRef.current = {
            x: start.offsetX + deltaX,
            y: start.offsetY + deltaY,
          };
          svgRef.current?.style.setProperty(
            "transform",
            `translate(${panOffsetRef.current.x}px, ${panOffsetRef.current.y}px)`,
          );
        }}
        onPointerUp={(event) => {
          const start = panRef.current;
          if (start) {
            suppressCanvasClickRef.current =
              Math.abs(event.clientX - start.x) > 4 ||
              Math.abs(event.clientY - start.y) > 4;
          }
          panRef.current = null;
          setPanning(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          persistMapView();
        }}
        onPointerCancel={(event) => {
          panRef.current = null;
          suppressCanvasClickRef.current = true;
          setPanning(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          persistMapView();
        }}
      >
        <svg
          className={styles.canvas}
          ref={svgRef}
          data-testid="knowledge-graph-canvas"
          width={canvasSize.width * zoom}
          height={canvasSize.height * zoom}
          aria-label="ASP Private Capital two-dimensional knowledge map"
        >
          <g ref={originRef} />
        </svg>
      </div>

      <div className={styles.toolbar} aria-label="Knowledge map controls">
        <button type="button" title="Return to graph" aria-label="Return to graph" onClick={() => fitGraph()}>
          <LocateFixed size={15} />
        </button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => changeZoom(0.78)}>
          <Minus size={15} />
        </button>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => changeZoom(1.28)}>
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
          : `${records.nodes.length} nodes · ${records.edges.length} links`}
      </div>
    </div>
  );
}
