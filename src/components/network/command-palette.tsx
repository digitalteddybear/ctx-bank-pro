"use client";

import { useMemo } from "react";
import { Command, FileText, Network, Search } from "lucide-react";
import {
  CommandPalette as AstryxCommandPalette,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import type { SearchSource } from "@astryxdesign/core/Typeahead";
import { searchGraph } from "@/lib/graph/engine";
import { nodeTypeLabels } from "@/lib/graph/palette";
import { useGraphStore } from "@/lib/graph/store";
import type { KnowledgeNode } from "@/lib/graph/types";

interface GraphCommandItem {
  id: string;
  label: string;
  auxiliaryData: {
    group: "Knowledge Bank" | "Navigate";
    node?: KnowledgeNode;
    detail: string;
  };
}

export function CommandPalette() {
  const open = useGraphStore((state) => state.commandOpen);
  const setOpen = useGraphStore((state) => state.setCommandOpen);
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const setHighlightedNodes = useGraphStore((state) => state.setHighlightedNodes);

  const searchSource = useMemo<SearchSource<GraphCommandItem>>(
    () => ({
      bootstrap: () => [
        {
          id: "navigate-dashboard",
          label: "Open Knowledge Bank Status",
          auxiliaryData: { group: "Navigate", detail: "Dashboard overview" },
        },
        {
          id: "navigate-network",
          label: "Open Knowledge Bank",
          auxiliaryData: { group: "Navigate", detail: "Explore the graph" },
        },
        {
          id: "navigate-sources",
          label: "Open Documents and Sources",
          auxiliaryData: { group: "Navigate", detail: "Review uploads and source records" },
        },
        ...searchGraph(snapshot, "", 6).map(({ node, reasons }) => ({
          id: `node-${node.id}`,
          label: node.label,
          auxiliaryData: {
            group: "Knowledge Bank" as const,
            node,
            detail: `${nodeTypeLabels[node.type]} · ${reasons.join(" · ")}`,
          },
        })),
      ],
      search: (query) =>
        searchGraph(snapshot, query, 12).map(({ node, reasons }) => ({
          id: `node-${node.id}`,
          label: node.label,
          auxiliaryData: {
            group: "Knowledge Bank" as const,
            node,
            detail: `${nodeTypeLabels[node.type]} · ${reasons.join(" · ")}`,
          },
        })),
    }),
    [snapshot],
  );

  const choose = (itemId: string) => {
    if (itemId === "navigate-dashboard") setViewMode("dashboard");
    if (itemId === "navigate-network") setViewMode("network");
    if (itemId === "navigate-sources") setViewMode("sources");
    if (itemId.startsWith("node-")) {
      const nodeId = itemId.slice("node-".length);
      selectNode(nodeId);
      setHighlightedNodes([nodeId]);
      setViewMode("network");
    }
    setOpen(false);
  };

  return (
    <AstryxCommandPalette
      isOpen={open}
      label="Search the Knowledge Bank"
      onOpenChange={setOpen}
      onValueChange={choose}
      searchSource={searchSource}
      emptySearchText="No graph nodes match this search. Try a title, tag, description, or node type."
      input={
        <CommandPaletteInput
          placeholder="Search nodes, descriptions, tags, and views…"
          endContent={<Command size={14} aria-label="Command key" />}
        />
      }
      renderItem={(item) => (
        <>
          {item.auxiliaryData.node ? <Network size={16} /> : <FileText size={16} />}
          <span>
            <strong>{item.label}</strong>
            <small>{item.auxiliaryData.detail}</small>
          </span>
          <Search size={14} aria-hidden="true" />
        </>
      )}
    />
  );
}
