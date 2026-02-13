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
}
