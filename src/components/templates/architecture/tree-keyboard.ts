// Adapted from Astryx Tree Table (MIT, Meta Platforms, Inc. and affiliates).
import type { TablePlugin } from "@astryxdesign/core/Table";
import type { ArchitectureNode } from "@/lib/architecture/types";

/** Astryx supplies the hierarchy; this adapter adds the template's treegrid keys. */
export function treeKeyboard(rows: ArchitectureNode[], selected: string, cursor: string,
  setCursor: (id: string) => void, select: (node: ArchitectureNode) => void,
  expanded: ReadonlySet<string>, toggle: (node: ArchitectureNode) => void): TablePlugin<ArchitectureNode> {
  return {
    transformTable: props => ({ ...props, htmlProps: { ...props.htmlProps, role: "treegrid", "aria-label": "Architecture files",
      onKeyDown: event => {
        props.htmlProps.onKeyDown?.(event);
        if (event.defaultPrevented || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        const row = (event.target as HTMLElement).closest<HTMLTableRowElement>("tr[data-architecture-id]");
        if (!row) return;
        const index = rows.findIndex(n => n.id === row.dataset.architectureId);
        const node = rows[index];
        if (!node) return;
        let next: ArchitectureNode | undefined;
        switch (event.key) {
          case "ArrowDown": next = rows[Math.min(index + 1, rows.length - 1)]; break;
          case "ArrowUp": next = rows[Math.max(index - 1, 0)]; break;
          case "Home": next = rows[0]; break;
          case "End": next = rows[rows.length - 1]; break;
          case "ArrowRight":
            if (node.children?.length) { if (expanded.has(node.id)) next = rows[index + 1]; else toggle(node); }
            break;
          case "ArrowLeft":
            if (node.children?.length && expanded.has(node.id)) toggle(node);
            else next = rows.find(n => n.children?.some(child => child.id === node.id));
            break;
          case "Enter": case " ":
            if (event.target !== row) return;
            select(node); break;
          default: return;
        }
        event.preventDefault();
        if (next) {
          setCursor(next.id);
          const target = Array.from(event.currentTarget.querySelectorAll<HTMLTableRowElement>("tr[data-architecture-id]")).find(r => r.dataset.architectureId === next.id);
          target?.focus();
        }
      } } }),
    transformBodyRow: (props, node) => ({ ...props, htmlProps: { ...props.htmlProps,
      tabIndex: node.id === (rows.some(n => n.id === cursor) ? cursor : rows[0]?.id) ? 0 : -1,
      "aria-selected": node.id === selected,
      ...{ "data-architecture-id": node.id },
      onFocus: event => { props.htmlProps.onFocus?.(event); setCursor(node.id); },
      onClick: event => { props.htmlProps.onClick?.(event); if (!(event.target as HTMLElement).closest("button")) select(node); },
    } }),
  };
}
