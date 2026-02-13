import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildDirectedGraph } from '../src/graph/directedGraph.js';

test('buildDirectedGraph projects plan, agents, docs, canvas and base with directed edges', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-directed-graph-'));
  const plansPath = join(root, 'plans');
  const planDir = join(plansPath, '0001-test-plan');
  const agentsDir = join(planDir, 'agents');

  mkdirSync(agentsDir, { recursive: true });

  writeFileSync(join(planDir, '0001-test-plan-plan.md'), '# plan\n', 'utf8');
  writeFileSync(join(planDir, 'notes.md'), '# notes\n', 'utf8');
  writeFileSync(join(planDir, 'board.canvas'), '{}\n', 'utf8');
  writeFileSync(join(planDir, 'model.base'), '{}\n', 'utf8');

  writeFileSync(
    join(agentsDir, '000_foundation.agent.md'),
    `---\ndepends_on: [001]\n---\n`,
    'utf8'
  );
  writeFileSync(
    join(agentsDir, '001_runtime.agent.md'),
    `---\ndepends_on: ["./000_foundation.agent.md"]\n---\n`,
    'utf8'
  );

  const graph = buildDirectedGraph(plansPath);

  assert.equal(graph.stats.plans, 1);
  assert.equal(graph.stats.agents, 2);
  assert.equal(graph.stats.docs, 1);
  assert.equal(graph.stats.canvas, 1);
  assert.equal(graph.stats.base, 1);

  const depEdges = graph.edges.filter((edge) => edge.type === 'depends-on');
  assert.equal(depEdges.length, 2);

  const containsEdges = graph.edges.filter((edge) => edge.type === 'plan-contains');
  assert.equal(containsEdges.length, 2);

  rmSync(root, { recursive: true, force: true });
});

test('buildDirectedGraph detects dependency cycles and unresolved dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-directed-cycle-'));
  const plansPath = join(root, 'plans');
  const planDir = join(plansPath, '0002-cycle-plan');
  const agentsDir = join(planDir, 'agents');

  mkdirSync(agentsDir, { recursive: true });

  writeFileSync(join(planDir, '0002-cycle-plan-plan.md'), '# plan\n', 'utf8');
  writeFileSync(
    join(agentsDir, '000_alpha.agent.md'),
    `---\ndepends_on: [001]\n---\n`,
    'utf8'
  );
  writeFileSync(
    join(agentsDir, '001_beta.agent.md'),
    `---\ndepends_on:\n  - 000\n  - 999\n---\n`,
    'utf8'
  );

  const graph = buildDirectedGraph(plansPath);

  assert.equal(graph.cycles.length, 1);
  assert.ok(graph.warnings.some((warning) => warning.includes("Unresolved depends_on '999'")));
  assert.equal(graph.stats.unresolvedRelations, 1);

  rmSync(root, { recursive: true, force: true });
});
