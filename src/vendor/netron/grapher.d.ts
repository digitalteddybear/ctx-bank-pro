export class Graph {
  constructor(compound: boolean);
  identifier: string;
  options: { direction: "horizontal" | "vertical" };
  width?: number;
  height?: number;
  originX?: number;
  originY?: number;
  nodes: Map<string, { v: string; label: Node }>;
  edges: Map<string, { v: string; w: string; label: Edge }>;
  setNode(node: Node): void;
  setEdge(edge: Edge): void;
  node(key: string): { v: string; label: Node } | undefined;
  edge(v: string, w: string, name?: string): { v: string; w: string; label: Edge } | undefined;
  build(document: Document, origin?: SVGGElement): void;
  measure(): Promise<void>;
  layout(worker?: unknown): Promise<string>;
  update(): void;
}

export class Node {
  name: string;
  id?: string;
  class?: string;
  element?: SVGGElement;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  header(): {
    add(id?: string | null, classes?: string[]): {
      content?: string;
      tooltip?: string;
      on(event: "click", callback: () => void): void;
    };
  };
  list(): {
    argument(name: string, value: string): {
      tooltip?: string;
      separator?: string;
    };
    add(value: unknown): void;
    on(event: "click", callback: () => void): void;
  };
  select(): SVGElement[];
  deselect(): void;
}

export class Edge {
  constructor(from: Node, to: Node);
  from: Node;
  to: Node;
  v: string;
  w: string;
  name?: string;
  id?: string;
  class?: string;
  label?: string;
  element?: SVGPathElement;
  hitTest?: SVGPathElement;
  labelElement?: SVGTextElement;
  activate?: () => void;
  select(): SVGElement[];
  deselect(): void;
}

export class Argument {}
