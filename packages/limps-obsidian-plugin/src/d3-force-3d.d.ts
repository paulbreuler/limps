declare module 'd3-force-3d' {
  export interface ForceCollideApi<NodeT = unknown> {
    (alpha: number): void;
    initialize?(nodes: NodeT[]): void;
    strength(value: number): ForceCollideApi<NodeT>;
    iterations(value: number): ForceCollideApi<NodeT>;
  }

  export function forceCollide<NodeT = unknown>(
    radius?: number | ((node: NodeT) => number)
  ): ForceCollideApi<NodeT>;

  export interface ForceRadialApi<NodeT = unknown> {
    (alpha: number): void;
    initialize?(nodes: NodeT[]): void;
    strength(value: number | ((node: NodeT, index: number, nodes: NodeT[]) => number)): ForceRadialApi<NodeT>;
  }

  export function forceRadial<NodeT = unknown>(
    radius?: number | ((node: NodeT) => number),
    x?: number,
    y?: number,
    z?: number
  ): ForceRadialApi<NodeT>;
}
