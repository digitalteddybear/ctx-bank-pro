"use client";

import { forceSimulation } from "d3-force";
import { LocateFixed, Minus, Network, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/primitives";
import { getNeighborhood } from "@/lib/graph/engine";
import { buildOrbitalLayout, type OrbitNode, type OrbitLink } from "@/lib/graph/orbital-layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useGraphStore } from "@/lib/graph/store";

type GraphNode = OrbitNode;
type GraphLink = OrbitLink;

type GraphSettings = {
  nodeSize: number;
  linkThickness: number;
  textFadeThreshold: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
};

type Transform = { x: number; y: number; scale: number };

const graphViewStorageKey = "ctxbankpro:neural-graph-view";
const minimumGraphZoom = 0.1;
const maximumGraphZoom = 5;
const graphMotionDuration = 260;

function readStoredGraphView(): Transform | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(graphViewStorageKey) ?? "null") as Partial<Transform> | null;
    if (!value || ![value.x, value.y, value.scale].every((item) => typeof item === "number")) return null;
    return value as Transform;
  } catch {
    return null;
  }
}

const defaultSettings: GraphSettings = {
  nodeSize: 1,
  linkThickness: 1,
  textFadeThreshold: 0.8,
  centerForce: 0.05,
  repelForce: -300,
  linkForce: 0.7,
  linkDistance: 45,
};

const nodeRadius = (node: GraphNode, nodeSize: number) =>
  ([24, 14, 5, 6, 6, 10][node.tier] ?? 6) * nodeSize;

function labelOpacity(scale: number, threshold: number) {
  const minimum = threshold * 0.75;
  const maximum = threshold * 1.5;
  return Math.max(0, Math.min(1, (scale - minimum) / (maximum - minimum)));
}

export function NeuralGraph({ compact = false }: { compact?: boolean }) {
  const [initialStoredView] = useState<Transform | null>(readStoredGraphView);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const transformRef = useRef<Transform>(initialStoredView ?? { x: 0, y: 0, scale: compact ? 0.72 : 1 });
  const hasInitializedViewRef = useRef(false);
  const transformAnimationRef = useRef<number | null>(null);
  const hasObservedSelectionRef = useRef(false);
  const previousSelectedNodeIdRef = useRef<string | null>(null);
  const interactionRef = useRef<{ pointerId: number | null; mode: "drag" | "pan" | null; node: GraphNode | null; x: number; y: number; moved: boolean }>({ pointerId: null, mode: null, node: null, x: 0, y: 0, moved: false });
  const settingsRef = useRef(defaultSettings);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedCohortRef = useRef<{ id: string; recordId: string } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedNodeIdRef = useRef<string | null>(null);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHighlightedNodes = useGraphStore((state) => state.setHighlightedNodes);

  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    if (selectedCohortRef.current?.recordId !== selectedNodeId) selectedCohortRef.current = null;
  }, [selectedNodeId]);

  const persistView = useCallback(() => {
    if (compact || typeof window === "undefined") return;
    window.sessionStorage.setItem(graphViewStorageKey, JSON.stringify(transformRef.current));
  }, [compact]);

  useEffect(() => {
    const { nodes, links } = buildOrbitalLayout(snapshot);
    simulationRef.current?.stop();
    const simulation = forceSimulation(nodes)
      .alphaDecay(0.08)
      .velocityDecay(0.4);
    simulationRef.current = simulation;
    nodesRef.current = nodes;
    linksRef.current = links;
    if (selectedCohortRef.current && !nodes.some(node => node.id === selectedCohortRef.current?.id)) selectedCohortRef.current = null;
    return () => {
      simulation.stop();
    };
  }, [snapshot]);

  const visibleNodes = useCallback(
    () => new Set(nodesRef.current.map((node) => node.id)),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    const context = canvas.getContext("2d");
    if (!context) return;

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (!hasInitializedViewRef.current) {
        transformRef.current = initialStoredView && !compact ? initialStoredView : { x: width / 2, y: height / 2, scale: Math.max(0.1, Math.min(width - 80, height - (compact ? 60 : 150)) / 1440) };
        hasInitializedViewRef.current = true;
      }
      render();
    };

    const render = () => {
      const ratio = window.devicePixelRatio || 1;
      const transform = transformRef.current;
      const css = getComputedStyle(canvas);
      const color = (name: string) => css.getPropertyValue(`--orbit-${name}`).trim();
      const visible = visibleNodes();
      const activeSelectedNodeId = selectedNodeIdRef.current;
      const focusId = selectedCohortRef.current?.id ?? hoveredIdRef.current ?? activeSelectedNodeId;
      const connected = new Set<string>();
      if (focusId) {
        connected.add(focusId);
        let ancestor = nodesRef.current.find(node => node.id === focusId);
        const members = new Set(ancestor?.members ?? []);
        nodesRef.current.forEach(node => { if (members.has(node.id) || node.members.some(id => members.has(id))) connected.add(node.id); });
        while (ancestor?.parentId) {
          connected.add(ancestor.parentId);
          ancestor = nodesRef.current.find(node => node.id === ancestor?.parentId);
        }
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = getComputedStyle(host).backgroundColor;
      context.fillRect(0, 0, width, height);
      context.save();
      context.translate(transform.x, transform.y);
      context.scale(transform.scale, transform.scale);
      context.lineCap = "round";

      linksRef.current.forEach((link) => {
        const source = typeof link.source === "string" ? undefined : link.source;
        const target = typeof link.target === "string" ? undefined : link.target;
        if (!source || !target || source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return;
        const sourceId = source.id;
        const targetId = target.id;
        if (!visible.has(sourceId) || !visible.has(targetId)) return;
        const highlighted = Boolean(focusId && connected.has(sourceId) && connected.has(targetId));
        const dimmed = Boolean(focusId && !highlighted);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.strokeStyle = highlighted ? color("focus") : color("edge");
        context.globalAlpha = dimmed ? 0.08 : highlighted ? 1 : [0.8, 0.8, 0.6, 0.4, 0.3, 0.3][target.tier];
        context.lineWidth = (highlighted ? 2 : target.tier === 1 ? 1.5 : target.tier === 5 ? 0.8 : 1) / transform.scale;
        context.stroke();
      });

      const labels = labelOpacity(transform.scale, settingsRef.current.textFadeThreshold);
      nodesRef.current.forEach((node) => {
        if (!visible.has(node.id) || node.x === undefined || node.y === undefined) return;
        const highlighted = node.id === focusId || node.id === activeSelectedNodeId;
        const dimmed = Boolean(focusId && !connected.has(node.id));
        const radius = nodeRadius(node, settingsRef.current.nodeSize) * (node.id === hoveredIdRef.current ? 1.25 : 1);
        context.beginPath();
        if (node.tier === 3 || node.tier === 4) context.roundRect(node.x-radius, node.y-radius, radius*2, radius*2, 2);
        else context.arc(node.x, node.y, radius, 0, Math.PI * 2);
        context.fillStyle = node.tier === 0 || node.tier === 5 ? color("panel") : color(node.color);
        context.globalAlpha = dimmed ? 0.12 : 1;
        context.fill();
        context.strokeStyle = highlighted ? color("focus") : node.tier === 0 ? color("green") : color("border");
        context.lineWidth = highlighted ? (node.id === activeSelectedNodeId ? 3 : 2) / transform.scale : node.tier === 0 ? 4 : 0.8;
        if (highlighted || node.tier === 0 || node.tier === 5) context.stroke();
        if (node.tier === 0 || node.tier === 1) {
          context.strokeStyle = node.tier === 0 ? color("green") : color("glyph");
          context.lineWidth = 1.5;
          context.strokeRect(node.x-5, node.y-7, 10, 14);
          for (const dx of [-2,2]) for (const dy of [-3,1]) context.strokeRect(node.x+dx-0.5,node.y+dy,1,1);
        }
        if (node.tier === 5 && transform.scale > 0.45) {
          context.fillStyle = color("text");
          context.font = "8px Inter, sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(node.label.split(/\s+/).slice(0,2).map(word => word[0]).join(""), node.x, node.y);
        }
        if (node.tier < 2 || highlighted || (transform.scale > 1.2 && node.tier === 5)) {
          context.globalAlpha = (dimmed ? 0.12 : highlighted ? 1 : 0.86) * labels;
          if (node.tier < 2 || highlighted) context.globalAlpha = dimmed ? 0.12 : 1;
          context.fillStyle = color("text");
          context.font = `${11 / transform.scale}px Inter, system-ui, sans-serif`;
          context.textAlign = node.tier < 2 ? "center" : "left";
          context.textBaseline = "middle";
          context.fillText(node.label, node.x + (node.tier < 2 ? 0 : radius + 5 / transform.scale), node.y + (node.tier < 2 ? radius + 14 / transform.scale : 0));
        }
      });
      context.restore();
    };

    const draw = () => {
      render();
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    frame = window.requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [compact, initialStoredView, visibleNodes]);

  const graphPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const transform = transformRef.current;
    return { x: (event.clientX - bounds.left - transform.x) / transform.scale, y: (event.clientY - bounds.top - transform.y) / transform.scale };
  };

  const hitNode = (point: { x: number; y: number }) => nodesRef.current.find((node) => {
    if (node.x === undefined || node.y === undefined || !visibleNodes().has(node.id)) return false;
    return Math.hypot(point.x - node.x, point.y - node.y) <= nodeRadius(node, settingsRef.current.nodeSize) + 2;
  }) ?? null;

  const stopTransformAnimation = useCallback(() => {
    if (transformAnimationRef.current !== null) {
      cancelAnimationFrame(transformAnimationRef.current);
      transformAnimationRef.current = null;
    }
  }, []);

  const animateTransform = useCallback((target: Transform) => {
    stopTransformAnimation();
    const start = { ...transformRef.current };
    const startedAt = performance.now();
    const duration = graphMotionDuration;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      transformRef.current = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        scale: start.scale + (target.scale - start.scale) * eased,
      };
      if (progress < 1) {
        transformAnimationRef.current = requestAnimationFrame(step);
      } else {
        transformAnimationRef.current = null;
        persistView();
      }
    };
    transformAnimationRef.current = requestAnimationFrame(step);
  }, [persistView, stopTransformAnimation]);

  const changeZoom = (factor: number) => {
    const host = hostRef.current;
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    const start = transformRef.current;
    const scale = Math.max(minimumGraphZoom, Math.min(maximumGraphZoom, start.scale * factor));
    const ratio = scale / start.scale;
    animateTransform({
      x: bounds.width / 2 - (bounds.width / 2 - start.x) * ratio,
      y: bounds.height / 2 - (bounds.height / 2 - start.y) * ratio,
      scale,
    });
  };

  const returnToGraph = () => {
    const host = hostRef.current;
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    const positioned = nodesRef.current.filter((node) => node.x !== undefined && node.y !== undefined);
    if (!positioned.length) return;
    const minX = Math.min(...positioned.map((node) => node.x as number));
    const maxX = Math.max(...positioned.map((node) => node.x as number));
    const minY = Math.min(...positioned.map((node) => node.y as number));
    const maxY = Math.max(...positioned.map((node) => node.y as number));
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    const padding = 64;
    const scale = Math.max(
      minimumGraphZoom,
      Math.min(maximumGraphZoom, (bounds.width - padding) / graphWidth, (bounds.height - padding) / graphHeight),
    );
    animateTransform({
      x: bounds.width / 2 - ((minX + maxX) / 2) * scale,
      y: bounds.height / 2 - ((minY + maxY) / 2) * scale,
      scale,
    });
  };

  const activeNodeCount = snapshot.nodes.filter((node) => !node.deletedAt).length;
  const activeLinkCount = snapshot.links.filter((link) => !link.deletedAt).length;

  useEffect(() => {
    const previousSelectedNodeId = previousSelectedNodeIdRef.current;
    previousSelectedNodeIdRef.current = selectedNodeId;
    if (!hasObservedSelectionRef.current) {
      hasObservedSelectionRef.current = true;
      return;
    }
    if (!selectedNodeId || compact || previousSelectedNodeId === selectedNodeId) return;
    if (selectedCohortRef.current?.recordId === selectedNodeId) return;
    const node = nodesRef.current.find((item) => item.id === selectedNodeId);
    const host = hostRef.current;
    if (!node || node.x === undefined || node.y === undefined || !host) return;
    const bounds = host.getBoundingClientRect();
    const current = transformRef.current;
    const scale = Math.max(current.scale, 0.9);
    animateTransform({
      x: bounds.width / 2 - node.x * scale,
      y: bounds.height / 2 - node.y * scale,
      scale,
    });
  }, [animateTransform, compact, selectedNodeId]);

  return (
    <VStack className="neural-graph neural-graph--orbital" ref={hostRef}>
      <canvas
        aria-label="Interactive knowledge graph"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.stopPropagation();
          stopTransformAnimation();
          const point = graphPoint(event);
          const node = hitNode(point);
          setIsInteracting(true);
          interactionRef.current = { pointerId: event.pointerId, mode: node ? "drag" : "pan", node, x: event.clientX, y: event.clientY, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const interaction = interactionRef.current;
          if (interaction.pointerId === event.pointerId && interaction.mode) {
            interaction.moved ||= Math.hypot(event.clientX - interaction.x, event.clientY - interaction.y) > 3;
            if (interaction.moved) {
              transformRef.current = { ...transformRef.current, x: transformRef.current.x + event.movementX, y: transformRef.current.y + event.movementY };
            }
            return;
          }
          setHoveredId(hitNode(graphPoint(event))?.id ?? null);
          const bounds = event.currentTarget.getBoundingClientRect();
          setTooltipPosition({ x: Math.max(110, Math.min(bounds.width-110, event.clientX-bounds.left)), y: Math.max(64, event.clientY-bounds.top) });
        }}
        onPointerUp={(event) => {
          const interaction = interactionRef.current;
          if (interaction.pointerId !== event.pointerId) return;
          if (interaction.node) {
            if (!interaction.moved) {
              const cohort = interaction.node.tier >= 1 && interaction.node.tier < 5;
              const recordId = interaction.node.tier >= 2 && interaction.node.tier < 5 ? interaction.node.members[0] ?? interaction.node.recordId : interaction.node.recordId;
              selectedCohortRef.current = cohort ? { id: interaction.node.id, recordId } : null;
              selectNode(recordId);
              setHighlightedNodes(
                cohort ? interaction.node.members : getNeighborhood(snapshot, interaction.node.id, 1).nodes.map((node) => node.id),
              );
            }
          } else if (!interaction.moved) {
            selectedCohortRef.current = null;
            setHoveredId(null);
            selectNode(null);
            setHighlightedNodes([]);
          }
          interactionRef.current = { pointerId: null, mode: null, node: null, x: 0, y: 0, moved: false };
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setIsInteracting(false);
          persistView();
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          interactionRef.current = { pointerId: null, mode: null, node: null, x: 0, y: 0, moved: false };
          setIsInteracting(false);
          persistView();
        }}
        onPointerLeave={() => {
          if (!isInteracting) setHoveredId(null);
        }}
        className={`graph-canvas${hoveredId ? " graph-canvas--node-hover" : ""}${isInteracting ? " graph-canvas--interacting" : ""}`}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          stopTransformAnimation();
          const bounds = event.currentTarget.getBoundingClientRect();
          const transform = transformRef.current;
          const cursorX = event.clientX - bounds.left;
          const cursorY = event.clientY - bounds.top;
          const nextScale = Math.max(
            minimumGraphZoom,
            Math.min(maximumGraphZoom, transform.scale * Math.exp(-event.deltaY * 0.0015)),
          );
          const scaleRatio = nextScale / transform.scale;
          transformRef.current = { x: cursorX - (cursorX - transform.x) * scaleRatio, y: cursorY - (cursorY - transform.y) * scaleRatio, scale: nextScale };
          requestAnimationFrame(() => {
            persistView();
          });
        }}
        ref={canvasRef}
      />
      {!compact && (
        <>
          <HStack className="graph-canvas-toolbar" aria-label="Knowledge graph controls">
            <IconButton label="Return to graph" onClick={returnToGraph}><LocateFixed size={15} /></IconButton>
            <IconButton label="Zoom out" onClick={() => changeZoom(0.78)}><Minus size={15} /></IconButton>
            <IconButton label="Zoom in" onClick={() => changeZoom(1.28)}><Plus size={15} /></IconButton>
          </HStack>
          <HStack className="graph-canvas-status">
            <Network size={12} />
            {activeNodeCount} nodes · {activeLinkCount} links
          </HStack>
        </>
      )}
      {hoveredId && !isInteracting && <VStack className="orbit-tooltip" role="tooltip" style={{ left: tooltipPosition.x, top: tooltipPosition.y }} gap={1}>
        <Text weight="semibold">{nodesRef.current.find(node => node.id === hoveredId)?.label}</Text>
        <Text type="supporting" color="secondary">{nodesRef.current.find(node => node.id === hoveredId)?.classification}</Text>
      </VStack>}
    </VStack>
  );
}
