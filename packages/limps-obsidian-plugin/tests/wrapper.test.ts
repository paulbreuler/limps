import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  execCommand,
  parseDependencyPathConversionText,
  parsePlanListEntry,
  parsePlanStatusData,
  parseHealthCheckData,
  parseAgentDetail,
  parseAgentList,
  buildPlanId,
  runLimps,
} from '../src/cli/wrapper.js';

test('execCommand parses valid JSON output', async () => {
  const result = await execCommand<{ ok: boolean }>({
    command: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({ok:true}))'],
    cwd: process.cwd(),
    timeoutMs: 2000,
    parseJson: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { ok: true });
});

test('execCommand returns parse failure for invalid JSON', async () => {
  const result = await execCommand({
    command: process.execPath,
    args: ['-e', 'console.log("not-json")'],
    cwd: process.cwd(),
    timeoutMs: 2000,
    parseJson: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /Failed to parse JSON output/);
});

test('execCommand reports non-zero exit code and stderr', async () => {
  const result = await execCommand({
    command: process.execPath,
    args: ['-e', 'console.error("boom"); process.exit(3);'],
    cwd: process.cwd(),
    timeoutMs: 2000,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 3);
  assert.match(result.stderr, /boom/);
});

test('execCommand marks timeout failures', async () => {
  const result = await execCommand({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => console.log("late"), 2000);'],
    cwd: process.cwd(),
    timeoutMs: 20,
  });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});

test('runLimps injects --config when provided', async () => {
  const result = await runLimps<string[]>(
    ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', '--'],
    {
      limpsPath: process.execPath,
      configPath: '/tmp/test-config.json',
      cwd: process.cwd(),
      timeoutMs: 2000,
      parseJson: true,
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, ['--config', '/tmp/test-config.json']);
});

test('runLimps executes js entrypoint via node process', async () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-obsidian-wrapper-'));
  const scriptPath = join(root, 'cli.js');
  writeFileSync(
    scriptPath,
    'console.log(JSON.stringify(process.argv.slice(2)));',
    'utf8'
  );

  const result = await runLimps<string[]>(['server', 'status'], {
    limpsPath: scriptPath,
    configPath: '/tmp/test-config.json',
    cwd: process.cwd(),
    timeoutMs: 2000,
    parseJson: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, ['server', 'status', '--config', '/tmp/test-config.json']);
  assert.notEqual(result.command, scriptPath);

  rmSync(root, { recursive: true, force: true });
});

test('parseDependencyPathConversionText parses structured plain text output', () => {
  const parsed = parseDependencyPathConversionText(`
Dependency path conversion complete

Plans processed: 7
Files scanned: 26
Files updated: 10
Dependencies converted: 42

Warnings:
  - unresolved dependency in 001.agent.md
  - another warning
`);

  assert.deepEqual(parsed, {
    plansProcessed: 7,
    filesScanned: 26,
    filesUpdated: 10,
    dependenciesConverted: 42,
    warnings: ['unresolved dependency in 001.agent.md', 'another warning'],
  });
});

test('parseDependencyPathConversionText returns null when required fields are missing', () => {
  const parsed = parseDependencyPathConversionText('Files scanned: 2');
  assert.equal(parsed, null);
});

// --- getPlanStatuses parsing tests ---

test('buildPlanId returns number-only format for reliable directory matching', () => {
  // plan list --json returns title-cased names that don't match directory slugs,
  // so we use number-only format which findPlanDirectory() matches reliably
  assert.equal(
    buildPlanId('0001', 'Signed Envelope Domain Model'),
    '0001',
  );
});

test('buildPlanId returns number-only even when name has slug prefix', () => {
  assert.equal(
    buildPlanId('0001', '0001-signed-envelope-domain-model'),
    '0001',
  );
});

test('buildPlanId returns number-only when name lacks prefix', () => {
  assert.equal(
    buildPlanId('0001', 'signed-envelope-domain-model'),
    '0001',
  );
});

test('parsePlanListEntry extracts fields from plan list JSON', () => {
  const raw = { number: '0001', name: 'signed-envelope-domain-model', status: 'PASS' };
  const entry = parsePlanListEntry(raw);
  assert.deepEqual(entry, {
    number: '0001',
    name: 'signed-envelope-domain-model',
    status: 'PASS',
  });
});

test('parsePlanListEntry returns null for missing number', () => {
  const entry = parsePlanListEntry({ name: 'foo', status: 'GAP' });
  assert.equal(entry, null);
});

test('parsePlanStatusData extracts agent counts and status breakdown', () => {
  const raw = {
    success: true,
    data: {
      planName: 'Signed Envelope Domain Model',
      totalAgents: 3,
      statusCounts: { GAP: 0, WIP: 0, PASS: 3, BLOCKED: 0 },
      completionPercentage: 100,
      blockedAgents: [],
      wipAgents: [],
    },
  };
  const status = parsePlanStatusData(raw, 'signed-envelope-domain-model');
  assert.equal(status.agentCount, 3);
  assert.equal(status.completion, 100);
  assert.deepEqual(status.statusCounts, { GAP: 0, WIP: 0, PASS: 3, BLOCKED: 0 });
  assert.equal(status.name, 'Signed Envelope Domain Model');
  assert.deepEqual(status.agents, []);
});

test('parsePlanStatusData falls back to plan name when planName missing', () => {
  const raw = { success: true, data: {} };
  const status = parsePlanStatusData(raw, 'fallback-name');
  assert.equal(status.name, 'fallback-name');
  assert.equal(status.agentCount, 0);
});

// --- getHealthCheck parsing tests ---

test('parseHealthCheckData extracts summary counts', () => {
  const raw = {
    success: true,
    data: {
      summary: { staleCount: 2, inferenceSuggestions: 3, driftCount: 1 },
      staleness: { total: 2, warning: 1, critical: 1 },
      inference: {
        plansChecked: 2,
        suggestionsCount: 3,
        suggestionsByPlan: [
          { planId: '0001-auth', count: 2 },
          { planId: '0002-api', count: 1 },
        ],
      },
      drift: {
        plansChecked: 2,
        driftCount: 1,
        driftsByPlan: [{ planId: '0001-auth', count: 1 }],
      },
    },
  };

  const result = parseHealthCheckData(raw);
  assert.equal(result.staleCount, 2);
  assert.equal(result.inferenceSuggestions, 3);
  assert.equal(result.driftCount, 1);
  assert.deepEqual(result.inferenceByPlan, [
    { planId: '0001-auth', count: 2 },
    { planId: '0002-api', count: 1 },
  ]);
  assert.deepEqual(result.driftByPlan, [{ planId: '0001-auth', count: 1 }]);
});

test('parseHealthCheckData returns zeros for missing data', () => {
  const result = parseHealthCheckData({ success: true, data: {} });
  assert.equal(result.staleCount, 0);
  assert.equal(result.inferenceSuggestions, 0);
  assert.equal(result.driftCount, 0);
  assert.deepEqual(result.inferenceByPlan, []);
  assert.deepEqual(result.driftByPlan, []);
});

// --- buildPlanId with title-cased names (the root cause of "0 agents") ---

test('buildPlanId uses number-only for title-cased human names from plan list', () => {
  // This is the actual format returned by `plan list --json`:
  // name: "Signed Envelope Domain Model" (title case, not a directory slug)
  assert.equal(
    buildPlanId('0001', 'Signed Envelope Domain Model'),
    '0001',
  );
  assert.equal(
    buildPlanId('0002', 'API Authentication Layer'),
    '0002',
  );
});

test('buildPlanId handles edge case of empty name', () => {
  assert.equal(buildPlanId('0003', ''), '0003');
});

// --- parseAgentDetail / parseAgentList tests ---

test('parseAgentDetail extracts agent fields from plan agents JSON', () => {
  const raw = {
    agentNumber: '001',
    title: 'Upload and download API endpoints',
    status: 'PASS',
    persona: 'coder',
  };
  const detail = parseAgentDetail(raw);
  assert.deepEqual(detail, {
    agentNumber: '001',
    title: 'Upload and download API endpoints',
    status: 'PASS',
    persona: 'coder',
  });
});

test('parseAgentDetail reads status from frontmatter when top-level missing', () => {
  const raw = {
    agentNumber: '002',
    title: 'Auth middleware',
    frontmatter: { status: 'WIP', persona: 'reviewer' },
  };
  const detail = parseAgentDetail(raw);
  assert.equal(detail?.status, 'WIP');
  assert.equal(detail?.persona, 'reviewer');
});

test('parseAgentDetail returns null for missing agentNumber', () => {
  assert.equal(parseAgentDetail({ title: 'No number' }), null);
});

test('parseAgentDetail defaults to GAP for invalid status', () => {
  const detail = parseAgentDetail({ agentNumber: '003', status: 'INVALID' });
  assert.equal(detail?.status, 'GAP');
});

test('parseAgentList extracts agents from plan agents --json output', () => {
  const raw = {
    success: true,
    data: {
      planName: '0001-auth',
      agents: [
        { agentNumber: '000', title: 'Setup', status: 'PASS', persona: 'coder' },
        { agentNumber: '001', title: 'Auth flow', status: 'WIP', persona: 'coder' },
        { agentNumber: '002', title: 'Review', status: 'GAP', persona: 'reviewer' },
      ],
      statusCounts: { GAP: 1, WIP: 1, PASS: 1, BLOCKED: 0 },
      total: 3,
    },
  };
  const agents = parseAgentList(raw);
  assert.equal(agents.length, 3);
  assert.equal(agents[0].title, 'Setup');
  assert.equal(agents[1].status, 'WIP');
  assert.equal(agents[2].persona, 'reviewer');
});

test('parseAgentList returns empty array for missing data', () => {
  assert.deepEqual(parseAgentList({ success: true, data: {} }), []);
});
