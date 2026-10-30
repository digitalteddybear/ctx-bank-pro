"use client";

import { useEffect, useMemo, useRef } from "react";
import { CircleDot, Users } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { useGraphStore } from "@/lib/graph/store";
import type { KnowledgeNode } from "@/lib/graph/types";
import styles from "./lead-columns.module.css";

const columnOrder = ["B2B_CORPORATE", "B2C_PERSONAL", "B2B_INSTITUTIONAL", "B2B"] as const;

const columnLabels: Record<(typeof columnOrder)[number], string> = {
  B2B_CORPORATE: "Corporate prospects",
  B2C_PERSONAL: "Personal prospects",
  B2B_INSTITUTIONAL: "Institutional prospects",
  B2B: "Entity accounts",
};

function classification(node: KnowledgeNode) {
  return columnOrder.find((value) => node.tags.includes(value)) ?? "B2B";
}

function email(node: KnowledgeNode) {
  return node.tags.find((tag) => tag.includes("@")) ?? "Email unavailable";
}

function reachability(node: KnowledgeNode) {
  const value = node.tags.find((tag) => tag.includes("REACHABLE"));
  return value ? value.replaceAll("_", " ").toLowerCase() : "Reachability pending";
}

export function LeadColumns() {
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const inspectorOpen = useGraphStore((state) => state.inspectorOpen);
  const selectNode = useGraphStore((state) => state.selectNode);
  const boardRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => {
    const groups = new Map(columnOrder.map((key) => [key, [] as KnowledgeNode[]]));
    snapshot.nodes
      .filter((node) => node.id.startsWith("lead-") && !node.deletedAt)
      .sort((left, right) => left.label.localeCompare(right.label))
      .forEach((node) => groups.get(classification(node))?.push(node));
    return columnOrder.map((key) => ({ key, label: columnLabels[key], leads: groups.get(key) ?? [] }));
  }, [snapshot]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const board = boardRef.current;
    const selected = board?.querySelector<HTMLElement>('[aria-selected="true"]');
    const scroller = selected?.closest<HTMLElement>(`.${styles.scroller}`);
    if (!board || !selected || !scroller) return;
    // Scroll the list itself; scrollIntoView also scrolls the board and page,
    // pulling column headings underneath the fixed toolbar on narrow screens.
    const itemBounds = selected.getBoundingClientRect();
    const listBounds = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + itemBounds.top - listBounds.top - (scroller.clientHeight - itemBounds.height) / 2, behavior: "smooth" });
    const column = selected.closest<HTMLElement>(`.${styles.column}`);
    if (column) {
      const bounds = column.getBoundingClientRect();
      const boardBounds = board.getBoundingClientRect();
      if (bounds.left < boardBounds.left || bounds.right > boardBounds.right) {
        board.scrollTo({ left: board.scrollLeft + bounds.left - boardBounds.left, top: 0, behavior: "smooth" });
      }
    }
  }, [selectedNodeId]);

  return (
    <HStack
      className={`${styles.board} ${inspectorOpen ? styles.boardWithInspector : ""}`}
      data-testid="lead-columns-board"
      gap={3}
      padding={0}
      ref={boardRef}
      vAlign="stretch"
    >
      {columns.map((column) => (
        <VStack as="section" className={styles.column} data-lead-column={column.key} gap={0} key={column.key}>
          <HStack as="header" className={styles.header} gap={2} padding={3} vAlign="center">
            <Users aria-hidden="true" size={16} />
            <StackItem size="fill">
              <Heading level={2}>{column.label}</Heading>
              <Text color="secondary" display="block" type="supporting">
                {column.key.replaceAll("_", " ").toLowerCase()}
              </Text>
            </StackItem>
            <Badge label={column.leads.length} variant="neutral" />
          </HStack>
          <StackItem className={styles.scroller} isScrollable size="fill">
            <List
              density="compact"
              hasDividers
              header={<VisuallyHidden>{column.label}, {column.leads.length} leads</VisuallyHidden>}
            >
              {column.leads.map((lead) => (
                <ListItem
                  description={
                    <VStack gap={0.5}>
                      <Text color="secondary" display="block" maxLines={1} type="supporting">
                        {email(lead)}
                      </Text>
                      <Text color="disabled" display="block" maxLines={1} type="supporting">
                        {reachability(lead)}
                      </Text>
                    </VStack>
                  }
                  isSelected={selectedNodeId === lead.id}
                  key={lead.id}
                  label={lead.label}
                  onClick={() => selectNode(lead.id)}
                  startContent={<CircleDot aria-hidden="true" className={styles.marker} size={12} />}
                />
              ))}
            </List>
          </StackItem>
        </VStack>
      ))}
    </HStack>
  );
}
