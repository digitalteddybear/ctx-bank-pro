"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Command, Search, X } from "lucide-react";
import { searchGraph } from "@/lib/graph/engine";
import { nodeTypeColors, nodeTypeLabels } from "@/lib/graph/palette";
import { useGraphStore } from "@/lib/graph/store";
import { IconButton } from "@/components/ui/primitives";

export function CommandPalette() {
  const open = useGraphStore((state) => state.commandOpen);
  const setOpen = useGraphStore((state) => state.setCommandOpen);
  const snapshot = useGraphStore((state) => state.snapshot);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const setHighlightedNodes = useGraphStore((state) => state.setHighlightedNodes);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => searchGraph(snapshot, query, 8), [query, snapshot]);

  if (!open) return null;

  const choose = (id: string) => {
    selectNode(id);
    setHighlightedNodes([id]);
    setViewMode("network");
    setOpen(false);
  };

  return (
    <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search the knowledge network"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(results.length - 1, index + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter" && results[activeIndex]) choose(results[activeIndex].node.id);
              if (event.key === "Escape") setOpen(false);
            }}
            placeholder="Search frameworks, systems, claims, sources…"
          />
          <IconButton label="Close search" onClick={() => setOpen(false)}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="command-meta">
          <span>
            <Command size={12} /> Semantic and lexical retrieval
          </span>
          <span>{results.length} results</span>
        </div>
        <div className="command-results">
          {results.map((result, index) => (
            <button
              key={result.node.id}
              className={index === activeIndex ? "is-active" : undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(result.node.id)}
            >
              <span
                className="result-node"
                style={{ backgroundColor: nodeTypeColors[result.node.type] }}
              />
              <span className="result-copy">
                <strong>{result.node.label}</strong>
                <small>
                  {nodeTypeLabels[result.node.type]} · {result.reasons.join(" · ")}
                </small>
              </span>
              <span className="result-score">{Math.round(result.score * 100)}</span>
              <ArrowRight size={15} />
            </button>
          ))}
          {!results.length && (
            <div className="command-empty">
              No indexed knowledge matched this query.
            </div>
          )}
        </div>
        <div className="command-footer">
          <span>
            <kbd>↑</kbd><kbd>↓</kbd> Navigate
          </span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
