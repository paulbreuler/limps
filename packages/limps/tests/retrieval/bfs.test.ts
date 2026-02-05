import { describe, it, expect, beforeEach } from 'vitest';
import { bfsExpansion, scoreByHopDistance } from '../../src/retrieval/bfs.js';
import type { GraphStorage } from '../../src/graph/storage.js';
import type { Entity } from '../../src/graph/types.js';

class MockGraphStorage implements Pick<GraphStorage, 'getEntity' | 'getNeighbors'> {
  private entities = new Map<string, Entity>();
  private adjacency = new Map<number, Entity[]>();
  private nextId = 1;

  addEntity(canonicalId: string, type: string, name: string): void {
    const entity: Entity = {
      id: this.nextId++,
      canonicalId,
      type,
      name,
      attributes: {},
    };
    this.entities.set(canonicalId, entity);
  }

  addEdge(fromCanonicalId: string, toCanonicalId: string): void {
    const fromEntity = this.entities.get(fromCanonicalId);
    const toEntity = this.entities.get(toCanonicalId);
    if (!fromEntity || !toEntity) {
      return;
    }

    const neighbors = this.adjacency.get(fromEntity.id) || [];
    if (!neighbors.find((n) => n.id === toEntity.id)) {
      neighbors.push(toEntity);
      this.adjacency.set(fromEntity.id, neighbors);
    }
  }

  getEntity(canonicalId: string): Entity | null {
    return this.entities.get(canonicalId) || null;
  }

  getNeighbors(entityId: number): Entity[] {
    return this.adjacency.get(entityId) || [];
  }
}

describe('bfsExpansion', () => {
  let storage: MockGraphStorage;

  beforeEach(() => {
    storage = new MockGraphStorage();
  });

  it('returns empty array for empty seeds', () => {
    const result = bfsExpansion(storage as any, [], { maxDepth: 1, hopDecay: 0.5 }, 10);
    expect(result).toEqual([]);
  });

  it('returns empty array when seed does not exist', () => {
    const result = bfsExpansion(
      storage as any,
      ['nonexistent'],
      { maxDepth: 1, hopDecay: 0.5 },
      10
    );
    expect(result).toEqual([]);
  });

  it('returns direct neighbors for 1-hop traversal', () => {
    storage.addEntity('plan:0001', 'plan', 'Plan 1');
    storage.addEntity('agent:0001#001', 'agent', 'Agent 1');
    storage.addEntity('agent:0001#002', 'agent', 'Agent 2');
    storage.addEdge('plan:0001', 'agent:0001#001');
    storage.addEdge('plan:0001', 'agent:0001#002');

    const result = bfsExpansion(storage as any, ['plan:0001'], { maxDepth: 1, hopDecay: 0.5 }, 10);

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.entity.canonicalId)).toContain('agent:0001#001');
    expect(result.map((n) => n.entity.canonicalId)).toContain('agent:0001#002');
    expect(result.every((n) => n.depth === 1)).toBe(true);
  });

  it('expands to 2 hops', () => {
    // plan:0001 -> agent:0001#001 -> file:auth.ts
    storage.addEntity('plan:0001', 'plan', 'Plan 1');
    storage.addEntity('agent:0001#001', 'agent', 'Agent 1');
    storage.addEntity('file:auth.ts', 'file', 'auth.ts');
    storage.addEdge('plan:0001', 'agent:0001#001');
    storage.addEdge('agent:0001#001', 'file:auth.ts');

    const result = bfsExpansion(storage as any, ['plan:0001'], { maxDepth: 2, hopDecay: 0.5 }, 10);

    expect(result).toHaveLength(2);
    const agent = result.find((n) => n.entity.canonicalId === 'agent:0001#001');
    const file = result.find((n) => n.entity.canonicalId === 'file:auth.ts');
    expect(agent?.depth).toBe(1);
    expect(file?.depth).toBe(2);
  });

  it('expands to 3 hops', () => {
    // plan:0001 -> agent:0001#001 -> file:auth.ts -> plan:0002
    storage.addEntity('plan:0001', 'plan', 'Plan 1');
    storage.addEntity('agent:0001#001', 'agent', 'Agent 1');
    storage.addEntity('file:auth.ts', 'file', 'auth.ts');
    storage.addEntity('plan:0002', 'plan', 'Plan 2');
    storage.addEdge('plan:0001', 'agent:0001#001');
    storage.addEdge('agent:0001#001', 'file:auth.ts');
    storage.addEdge('file:auth.ts', 'plan:0002');

    const result = bfsExpansion(storage as any, ['plan:0001'], { maxDepth: 3, hopDecay: 0.5 }, 10);

    expect(result).toHaveLength(3);
    expect(result.map((n) => n.depth)).toContain(1);
    expect(result.map((n) => n.depth)).toContain(2);
    expect(result.map((n) => n.depth)).toContain(3);
  });

  it('prevents cycles by not revisiting nodes', () => {
    // Cycle: A -> B -> C -> A
    storage.addEntity('A', 'node', 'A');
    storage.addEntity('B', 'node', 'B');
    storage.addEntity('C', 'node', 'C');
    storage.addEdge('A', 'B');
    storage.addEdge('B', 'C');
    storage.addEdge('C', 'A');

    const result = bfsExpansion(storage as any, ['A'], { maxDepth: 5, hopDecay: 0.5 }, 10);

    // Should visit B and C only once
    expect(result).toHaveLength(2);
    const ids = result.map((n) => n.entity.canonicalId);
    expect(ids).toContain('B');
    expect(ids).toContain('C');
    expect(ids.filter((id) => id === 'B')).toHaveLength(1);
    expect(ids.filter((id) => id === 'C')).toHaveLength(1);
  });

  it('respects depth limit', () => {
    // Chain: A -> B -> C -> D
    storage.addEntity('A', 'node', 'A');
    storage.addEntity('B', 'node', 'B');
    storage.addEntity('C', 'node', 'C');
    storage.addEntity('D', 'node', 'D');
    storage.addEdge('A', 'B');
    storage.addEdge('B', 'C');
    storage.addEdge('C', 'D');

    const result = bfsExpansion(storage as any, ['A'], { maxDepth: 2, hopDecay: 0.5 }, 10);

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.entity.canonicalId)).toContain('B');
    expect(result.map((n) => n.entity.canonicalId)).toContain('C');
    expect(result.map((n) => n.entity.canonicalId)).not.toContain('D');
  });

  it('respects result limit', () => {
    storage.addEntity('root', 'node', 'Root');
    for (let i = 0; i < 10; i++) {
      storage.addEntity(`node${i}`, 'node', `Node ${i}`);
      storage.addEdge('root', `node${i}`);
    }

    const result = bfsExpansion(storage as any, ['root'], { maxDepth: 1, hopDecay: 0.5 }, 5);

    expect(result).toHaveLength(5);
  });

  it('merges results from multiple seeds without duplicates', () => {
    // seed1 -> A, B
    // seed2 -> B, C
    storage.addEntity('seed1', 'node', 'Seed 1');
    storage.addEntity('seed2', 'node', 'Seed 2');
    storage.addEntity('A', 'node', 'A');
    storage.addEntity('B', 'node', 'B');
    storage.addEntity('C', 'node', 'C');
    storage.addEdge('seed1', 'A');
    storage.addEdge('seed1', 'B');
    storage.addEdge('seed2', 'B');
    storage.addEdge('seed2', 'C');

    const result = bfsExpansion(
      storage as any,
      ['seed1', 'seed2'],
      { maxDepth: 1, hopDecay: 0.5 },
      10
    );

    // Should get A, B, C (B not duplicated)
    expect(result).toHaveLength(3);
    const ids = result.map((n) => n.entity.canonicalId);
    expect(ids).toContain('A');
    expect(ids).toContain('B');
    expect(ids).toContain('C');
  });

  it('stops early when limit reached', () => {
    storage.addEntity('root', 'node', 'Root');
    storage.addEntity('A', 'node', 'A');
    storage.addEntity('B', 'node', 'B');
    storage.addEntity('C', 'node', 'C');
    storage.addEntity('D', 'node', 'D');
    storage.addEdge('root', 'A');
    storage.addEdge('A', 'B');
    storage.addEdge('A', 'C');
    storage.addEdge('A', 'D');

    const result = bfsExpansion(storage as any, ['root'], { maxDepth: 3, hopDecay: 0.5 }, 2);

    expect(result).toHaveLength(2);
  });
});

describe('scoreByHopDistance', () => {
  it('scores nodes by hop distance with decay', () => {
    const nodes = [
      { entity: { canonicalId: 'A', id: 1, type: 'node', name: 'A', attributes: {} }, depth: 1 },
      { entity: { canonicalId: 'B', id: 2, type: 'node', name: 'B', attributes: {} }, depth: 2 },
      { entity: { canonicalId: 'C', id: 3, type: 'node', name: 'C', attributes: {} }, depth: 3 },
    ];

    const scored = scoreByHopDistance(nodes, 0.5);

    expect(scored[0].score).toBe(0.5); // 0.5^1
    expect(scored[1].score).toBe(0.25); // 0.5^2
    expect(scored[2].score).toBe(0.125); // 0.5^3
  });

  it('handles decay of 1.0 (no decay)', () => {
    const nodes = [
      { entity: { canonicalId: 'A', id: 1, type: 'node', name: 'A', attributes: {} }, depth: 1 },
      { entity: { canonicalId: 'B', id: 2, type: 'node', name: 'B', attributes: {} }, depth: 2 },
    ];

    const scored = scoreByHopDistance(nodes, 1.0);

    expect(scored[0].score).toBe(1.0);
    expect(scored[1].score).toBe(1.0);
  });

  it('handles depth 0 (seeds)', () => {
    const nodes = [
      { entity: { canonicalId: 'A', id: 1, type: 'node', name: 'A', attributes: {} }, depth: 0 },
    ];

    const scored = scoreByHopDistance(nodes, 0.5);

    expect(scored[0].score).toBe(1.0); // 0.5^0 = 1
  });

  it('returns empty array for empty input', () => {
    const scored = scoreByHopDistance([], 0.5);
    expect(scored).toEqual([]);
  });
});
