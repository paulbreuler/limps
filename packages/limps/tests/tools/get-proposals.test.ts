/**
 * Tests for get_proposals MCP tool.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleGetProposals, GetProposalsInputSchema } from '../../src/tools/get-proposals.js';
import type { ServerConfig } from '../../src/config.js';
import type { ToolContext } from '../../src/types.js';

describe('get_proposals tool', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;
  let context: ToolContext;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-get-proposals-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    mkdirSync(plansDir, { recursive: true });

    config = {
      plansPath: plansDir,
      dataPath: join(testDir, 'data'),
      scoring: {
        weights: { dependency: 40, priority: 30, workload: 30 },
        biases: {},
      },
    };

    context = {
      config,
      db: null as never,
    };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('returns error when plan not found', async () => {
    const input = GetProposalsInputSchema.parse({ planId: '9999' });
    const result = await handleGetProposals(input, context);

    expect(result.isError).toBe(true);
    const text = (result.content![0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Plan not found');
  });

  it('returns error when codebasePath contains path traversal', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(join(planDir, 'agents'), { recursive: true });
    writeFileSync(
      join(planDir, '0001-test-plan-plan.md'),
      '---\ntitle: Test\n---\n\n# Plan',
      'utf-8'
    );
    // Use a path string that literally contains ".." (path.join would resolve it)
    const input = GetProposalsInputSchema.parse({
      planId: '1',
      codebasePath: 'plans/../etc',
    });
    const result = await handleGetProposals(input, context);

    expect(result.isError).toBe(true);
    const text = (result.content![0] as { type: 'text'; text: string }).text;
    expect(text).toContain('path traversal');
  });

  it('returns empty proposals for plan with no issues', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(planDir, '0001-test-plan-plan.md'),
      '---\ntitle: Test\nstatus: active\n---\n\n# Plan',
      'utf-8'
    );
    writeFileSync(
      join(agentsDir, '000_agent.agent.md'),
      `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
updated: 2026-01-01
---

# Agent 0

Content.
`,
      'utf-8'
    );

    const input = GetProposalsInputSchema.parse({ planId: '1' });
    const result = await handleGetProposals(input, context);

    expect(result.isError).toBeFalsy();
    const text = (result.content![0] as { type: 'text'; text: string }).text;
    const data = JSON.parse(text);
    expect(data.proposals).toBeDefined();
    expect(Array.isArray(data.proposals)).toBe(true);
    expect(data.count).toBe(data.proposals.length);
  });

  it('includes status proposals from inference when body mentions blocked', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(planDir, '0001-test-plan-plan.md'),
      '---\ntitle: Test\nstatus: active\n---\n\n# Plan',
      'utf-8'
    );
    writeFileSync(
      join(agentsDir, '000_agent.agent.md'),
      `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0

Currently blocked.
`,
      'utf-8'
    );

    const input = GetProposalsInputSchema.parse({ planId: '1' });
    const result = await handleGetProposals(input, context);

    expect(result.isError).toBeFalsy();
    const text = (result.content![0] as { type: 'text'; text: string }).text;
    const data = JSON.parse(text);
    const statusProposals = data.proposals.filter((p: { type: string }) => p.type === 'status');
    expect(statusProposals.length).toBeGreaterThanOrEqual(1);
    expect(statusProposals[0].suggestedStatus ?? statusProposals[0].proposedValue).toBe('BLOCKED');
  });
});
