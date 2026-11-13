"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Building2,
  CircleDot,
  GripVertical,
  Mail,
  User,
  Users,
} from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useGraphStore } from "@/lib/graph/store";
import type { KnowledgeNode } from "@/lib/graph/types";
import styles from "./lead-columns.module.css";

export const columnOrder = ["B2B_CORPORATE", "B2C_PERSONAL", "B2B_INSTITUTIONAL", "B2B"] as const;
export type ColumnKey = (typeof columnOrder)[number];

export const columnLabels: Record<ColumnKey, string> = {
  B2B_CORPORATE: "Corporate",
  B2C_PERSONAL: "Personal",
  B2B_INSTITUTIONAL: "Institutional",
  B2B: "Entity Accounts",
};

const columnVariants: Record<ColumnKey, "accent" | "neutral" | "warning" | "success"> = {
  B2B_CORPORATE: "accent",
  B2C_PERSONAL: "neutral",
  B2B_INSTITUTIONAL: "warning",
  B2B: "success",
};

const columnIcons: Record<ColumnKey, typeof Users> = {
  B2B_CORPORATE: Building2,
  B2C_PERSONAL: User,
  B2B_INSTITUTIONAL: Users,
  B2B: CircleDot,
};

function classification(node: KnowledgeNode): ColumnKey {
  return columnOrder.find((value) => node.tags.includes(value)) ?? "B2B";
}

function email(node: KnowledgeNode): string {
  return node.tags.find((tag) => tag.includes("@")) ?? "Email unavailable";
}

function reachability(node: KnowledgeNode): string {
  const value = node.tags.find((tag) => tag.includes("REACHABLE"));
  return value ? value.replaceAll("_", " ").toLowerCase() : "Reachability pending";
}

interface DropTarget {
  column: ColumnKey;
  index: number;
}

interface DragState {
  leadId: string;
  leadNode: KnowledgeNode;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  pointerX: number;
  pointerY: number;
  target: DropTarget | null;
}

const DRAG_THRESHOLD = 5;

export function LeadColumns() {
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const inspectorOpen = useGraphStore((state) => state.inspectorOpen);
  const selectNode = useGraphStore((state) => state.selectNode);
  const updateNodeTags = useGraphStore((state) => state.updateNodeTags);

  const boardRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Map<ColumnKey, HTMLElement>>(new Map());

  const [drag, setDrag] = useState<DragState | null>(null);
  const pressRef = useRef<{ id: string; lead: KnowledgeNode; x: number; y: number; width: number; height: number; el: HTMLElement } | null>(null);

  const columns = useMemo(() => {
    const groups = new Map<ColumnKey, KnowledgeNode[]>(columnOrder.map((key) => [key, []]));
    snapshot.nodes
      .filter((node) => node.id.startsWith("lead-") && !node.deletedAt)
      .sort((left, right) => left.label.localeCompare(right.label))
      .forEach((node) => groups.get(classification(node))?.push(node));
    return columnOrder.map((key) => ({
      key,
      label: columnLabels[key],
      variant: columnVariants[key],
      icon: columnIcons[key],
      leads: groups.get(key) ?? [],
    }));
  }, [snapshot]);

  const handleMove = useCallback((leadId: string, toColumn: ColumnKey) => {
    const lead = snapshot.nodes.find((n) => n.id === leadId);
    if (!lead) return;
    const currentClass = classification(lead);
    if (currentClass === toColumn) return;
    const nextTags = lead.tags.filter((t) => !columnOrder.includes(t as ColumnKey)).concat(toColumn);
    updateNodeTags(leadId, nextTags);
  }, [snapshot.nodes, updateNodeTags]);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>, lead: KnowledgeNode) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("[role='menuitem']")) return;
    const cardEl = e.currentTarget;
    const rect = cardEl.getBoundingClientRect();
    pressRef.current = {
      id: lead.id,
      lead,
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      el: cardEl,
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (pressRef.current && !drag) {
        const dx = e.clientX - pressRef.current.x;
        const dy = e.clientY - pressRef.current.y;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          const rect = pressRef.current.el.getBoundingClientRect();
          setDrag({
            leadId: pressRef.current.id,
            leadNode: pressRef.current.lead,
            width: rect.width,
            height: rect.height,
            offsetX: pressRef.current.x - rect.left,
            offsetY: pressRef.current.y - rect.top,
            pointerX: e.clientX,
            pointerY: e.clientY,
            target: null,
          });
        }
      }

      if (!drag) return;

      let bestTarget: DropTarget | null = null;
      for (const [colKey, colEl] of columnRefs.current.entries()) {
        const rect = colEl.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          bestTarget = { column: colKey, index: 0 };
          break;
        }
      }

      setDrag((prev) => (prev ? { ...prev, pointerX: e.clientX, pointerY: e.clientY, target: bestTarget } : null));
    };

    const onPointerUp = () => {
      if (drag && drag.target) {
        handleMove(drag.leadId, drag.target.column);
      }
      pressRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [drag, handleMove]);

  return (
    <div
      className={`${styles.board} ${inspectorOpen ? styles.boardWithInspector : ""}`}
      data-testid="lead-columns-board"
      ref={boardRef}
    >
      <div className={styles.boardHeader}>
        <HStack gap={3} vAlign="center">
          <Heading level={2}>Pipeline</Heading>
          <Text color="secondary" type="supporting">
            Categorization and qualification lanes.
          </Text>
        </HStack>
      </div>

      <div className={styles.lanesContainer}>
        {columns.map((column) => {
          const isTargetLane = drag?.target?.column === column.key;
          const IconComponent = column.icon;
          return (
            <div
              className={`${styles.kanbanColumn} ${isTargetLane ? styles.laneActive : ""}`}
              data-lead-column={column.key}
              key={column.key}
              ref={(el) => {
                if (el) columnRefs.current.set(column.key, el);
                else columnRefs.current.delete(column.key);
              }}
            >
              <div className={styles.laneHeader}>
                <HStack gap={2} vAlign="center">
                  <span className={`${styles.statusPill} ${styles[`status_${column.variant}`]}`} />
                  <IconComponent aria-hidden="true" size={16} />
                  <StackItem size="fill">
                    <Heading level={3} maxLines={1}>
                      {column.label}
                    </Heading>
                    <Text color="secondary" display="block" type="supporting">
                      {column.key.replaceAll("_", " ").toLowerCase()}
                    </Text>
                  </StackItem>
                  <Badge label={column.leads.length} variant="neutral" />
                </HStack>
              </div>

              <div className={styles.laneCardsScroller}>
                {column.leads.map((lead) => {
                  const isBeingDragged = drag?.leadId === lead.id;
                  const isSelected = selectedNodeId === lead.id;
                  const leadEmail = email(lead);
                  const leadReach = reachability(lead);

                  if (isBeingDragged) {
                    return (
                      <div
                        className={styles.ghostPlaceholder}
                        key={lead.id}
                        style={{ height: drag.height }}
                      />
                    );
                  }

                  return (
                    <Card
                      className={`${styles.kanbanCard} ${isSelected ? styles.cardSelected : ""}`}
                      key={lead.id}
                      onClick={() => selectNode(lead.id)}
                      onPointerDown={(e) => handlePointerDown(e, lead)}
                      padding={4}
                      variant={isSelected ? "cyan" : "default"}
                    >
                      <HStack gap={2} vAlign="start">
                        <GripVertical aria-hidden="true" className={styles.gripHandle} size={14} />
                        <StackItem size="fill">
                          <VStack gap={1.5}>
                            <HStack hAlign="between" vAlign="center">
                              <Text weight="medium" maxLines={1}>
                                {lead.label}
                              </Text>
                              <Badge
                                label={leadReach.includes("reachable") ? "Verified" : "Pending"}
                                variant={leadReach.includes("reachable") ? "success" : "neutral"}
                              />
                            </HStack>

                            <HStack gap={1.5} vAlign="center">
                              <Mail aria-hidden="true" className={styles.metaIcon} size={13} />
                              <Text color="secondary" maxLines={1} type="supporting">
                                {leadEmail}
                              </Text>
                            </HStack>

                            <HStack gap={1} wrap="wrap" className={styles.cardTags}>
                              {lead.tags
                                .filter((t) => !t.includes("@") && !columnOrder.includes(t as ColumnKey))
                                .slice(0, 3)
                                .map((tag) => (
                                  <Token key={tag} label={tag.replaceAll("_", " ").toLowerCase()} size="sm" />
                                ))}
                            </HStack>
                          </VStack>
                        </StackItem>
                      </HStack>
                    </Card>
                  );
                })}

                {column.leads.length === 0 && !isTargetLane && (
                  <EmptyState
                    description={`No ${column.label.toLowerCase()} currently in this pipeline lane.`}
                    headingLevel={3}
                    icon={<IconComponent size={20} />}
                    isCompact
                    title="Empty lane"
                  />
                )}

                {isTargetLane && drag && (
                  <div
                    className={styles.ghostDropIndicator}
                    style={{ height: drag.height }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {drag && (
        <div
          className={styles.floatingCard}
          style={{
            width: drag.width,
            transform: `translate(${drag.pointerX - drag.offsetX}px, ${drag.pointerY - drag.offsetY}px)`,
          }}
        >
          <Card padding={3} variant="default" className={styles.floatingInner}>
            <VStack gap={1}>
              <HStack hAlign="between" vAlign="center">
                <Text weight="bold" maxLines={1}>
                  {drag.leadNode.label}
                </Text>
                <Badge label="Moving" variant="info" />
              </HStack>
              <Text color="secondary" type="supporting" maxLines={1}>
                {email(drag.leadNode)}
              </Text>
            </VStack>
          </Card>
        </div>
      )}
    </div>
  );
}
