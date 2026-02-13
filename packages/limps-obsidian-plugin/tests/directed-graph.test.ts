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

test('buildDirectedGraph canonicalizes blocks as dependency edges', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-directed-blocks-'));
  const plansPath = join(root, 'plans');
  const planDir = join(plansPath, '0003-blocks-plan');
  const agentsDir = join(planDir, 'agents');
  mkdirSync(agentsDir, { recursive: true });

  writeFileSync(join(planDir, '0003-blocks-plan-plan.md'), '# plan\n', 'utf8');
  writeFileSync(
    join(agentsDir, '000_alpha.agent.md'),
    `---\nblocks: [001]\n---\n`,
    'utf8'
  );
  writeFileSync(
    join(agentsDir, '001_beta.agent.md'),
    `---\ndepends_on: []\n---\n`,
    'utf8'
  );

  const graph = buildDirectedGraph(plansPath);
  const alpha = graph.nodes.find((node) => node.filePath.endsWith('000_alpha.agent.md'));
  const beta = graph.nodes.find((node) => node.filePath.endsWith('001_beta.agent.md'));
  assert.ok(alpha);
  assert.ok(beta);
  assert.ok(
    graph.edges.some((edge) => edge.type === 'depends-on' && edge.from === beta?.id && edge.to === alpha?.id)
  );

  rmSync(root, { recursive: true, force: true });
});

test('buildDirectedGraph includes roadmap and cross-plan references', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-directed-roadmap-'));
  const plansPath = join(root, 'plans');
  const planA = join(plansPath, '0004-alpha');
  const planB = join(plansPath, '0005-beta');
  mkdirSync(join(planA, 'agents'), { recursive: true });
  mkdirSync(join(planB, 'agents'), { recursive: true });

  writeFileSync(join(planA, '0004-alpha-plan.md'), '# alpha\n', 'utf8');
  writeFileSync(join(planB, '0005-beta-plan.md'), '# beta\n', 'utf8');
  writeFileSync(join(planB, 'notes.md'), '# notes\n', 'utf8');
  writeFileSync(
    join(plansPath, 'Roadmap.md'),
    '[Beta](./0005-beta/0005-beta-plan.md)\n[[0005-beta/notes]]\n',
    'utf8'
  );

  const graph = buildDirectedGraph(plansPath);
  assert.equal(graph.stats.roadmap, 1);
  const roadmapNode = graph.nodes.find((node) => node.type === 'roadmap');
  const betaPlanNode = graph.nodes.find((node) => node.type === 'plan' && node.label === '0005-beta');
  assert.ok(roadmapNode);
  assert.ok(betaPlanNode);
  assert.ok(
    graph.edges.some(
      (edge) => edge.type === 'references' && edge.from === roadmapNode?.id && edge.to === betaPlanNode?.id
    )
  );

  rmSync(root, { recursive: true, force: true });
});

test('buildDirectedGraph resolves /plans absolute links and ignores placeholder path warnings', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-directed-absolute-links-'));
  const plansPath = join(root, 'plans');
  const planDir = join(plansPath, '0032-limps-llms-txt');
  mkdirSync(join(planDir, 'agents'), { recursive: true });
  mkdirSync(join(plansPath, '0027-limps-roadmap'), { recursive: true });

  writeFileSync(join(planDir, '0032-limps-llms-txt-plan.md'), '# llms\n', 'utf8');
  writeFileSync(join(plansPath, 'Roadmap.md'), '# roadmap\n', 'utf8');
  writeFileSync(join(plansPath, '0027-limps-roadmap', '0027-limps-roadmap-plan.md'), '# 0027\n', 'utf8');
  writeFileSync(
    join(planDir, 'notes.md'),
    [
      '[/plans/0027-limps-roadmap/0027-limps-roadmap-plan.md](/plans/0027-limps-roadmap/0027-limps-roadmap-plan.md)',
      '',
      '[Directory](/plans/active/)',
      '[Template](path.md)',
    ].join('\n'),
    'utf8'
  );

  const graph = buildDirectedGraph(plansPath);
  const notes = graph.nodes.find((node) => node.filePath.endsWith('/0032-limps-llms-txt/notes.md'));
  const targetPlan = graph.nodes.find((node) => node.filePath.endsWith('/0027-limps-roadmap/0027-limps-roadmap-plan.md'));
  assert.ok(notes);
  assert.ok(targetPlan);
  assert.ok(
    graph.edges.some(
      (edge) => edge.type === 'references' && edge.from === notes?.id && edge.to === targetPlan?.id
    )
  );
  assert.ok(!graph.warnings.some((warning) => warning.includes('/plans/active/')));
  assert.ok(!graph.warnings.some((warning) => warning.includes('path.md')));

  rmSync(root, { recursive: true, force: true });
});

test('buildDirectedGraph does not collapse grouped folders (Completed/*) into one plan', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-directed-completed-namespace-'));
  const plansPath = join(root, 'plans');
  const completedA = join(plansPath, 'Completed', '0030-alpha');
  const completedB = join(plansPath, 'Completed', '0031-beta');
  mkdirSync(join(completedA, 'agents'), { recursive: true });
  mkdirSync(join(completedB, 'agents'), { recursive: true });

  writeFileSync(join(completedA, '0030-alpha-plan.md'), '# alpha\n', 'utf8');
  writeFileSync(join(completedB, '0031-beta-plan.md'), '# beta\n', 'utf8');
  writeFileSync(join(completedA, 'agents', '000_a.agent.md'), '---\ndepends_on: []\n---\n', 'utf8');
  writeFileSync(join(completedB, 'agents', '000_b.agent.md'), '---\ndepends_on: []\n---\n', 'utf8');

  const graph = buildDirectedGraph(plansPath);
  const alphaPlan = graph.nodes.find((node) => node.filePath.endsWith('/Completed/0030-alpha/0030-alpha-plan.md'));
  const betaPlan = graph.nodes.find((node) => node.filePath.endsWith('/Completed/0031-beta/0031-beta-plan.md'));
  const alphaAgent = graph.nodes.find((node) => node.filePath.endsWith('/Completed/0030-alpha/agents/000_a.agent.md'));
  const betaAgent = graph.nodes.find((node) => node.filePath.endsWith('/Completed/0031-beta/agents/000_b.agent.md'));

  assert.ok(alphaPlan);
  assert.ok(betaPlan);
  assert.ok(alphaAgent);
  assert.ok(betaAgent);
  assert.ok(graph.edges.some((edge) => edge.type === 'plan-contains' && edge.from === alphaPlan?.id && edge.to === alphaAgent?.id));
  assert.ok(graph.edges.some((edge) => edge.type === 'plan-contains' && edge.from === betaPlan?.id && edge.to === betaAgent?.id));
  assert.ok(!graph.edges.some((edge) => edge.type === 'plan-contains' && edge.from === alphaPlan?.id && edge.to === betaAgent?.id));

  rmSync(root, { recursive: true, force: true });
});
