/**
 * Tests for apply_proposal MCP tool.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getProposals, applyProposal } from '../../src/cli/proposals.js';
import { handleApplyProposal, ApplyProposalInputSchema } from '../../src/tools/apply-proposal.js';
import type { ServerConfig } from '../../src/config.js';
import type { ToolContext } from '../../src/types.js';

describe('apply_proposal tool', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;
  let context: ToolContext;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-apply-proposal-${Date.now()}`);
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

  it('applyProposal returns error when confirm is false', () => {
    const result = applyProposal(config, 'proposal_0001_abc123', false);
    expect(result.applied).toBe(false);
    expect(result.error).toContain('confirm must be true');
  });

  it('returns error when proposal not found', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    mkdirSync(join(planDir, 'agents'), { recursive: true });
    writeFileSync(
      join(planDir, '0001-test-plan-plan.md'),
      '---\ntitle: Test\n---\n\n# Plan',
      'utf-8'
    );

    const result = await handleApplyProposal(
      ApplyProposalInputSchema.parse({
        proposalId: 'proposal_0001_nonexistent999',
        confirm: true,
        planId: '1',
      }),
      context
    );

    expect(result.isError).toBe(true);
    const text = (result.content![0] as { type: 'text'; text: string }).text;
    expect(text).toContain('not found');
  });

  it('applies status proposal and updates file', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(planDir, '0001-test-plan-plan.md'),
      '---\ntitle: Test\nstatus: active\n---\n\n# Plan',
      'utf-8'
    );
    const agentPath = join(agentsDir, '000_agent.agent.md');
    writeFileSync(
      agentPath,
      `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0

Blocked on review.
`,
      'utf-8'
    );

    const { proposals } = getProposals(config, { planId: '1' });
    const statusProposal = proposals.find(
      (p) => p.type === 'status' && p.proposedValue === 'BLOCKED'
    );
    expect(statusProposal).toBeDefined();

    const applyResult = applyProposal(config, statusProposal!.id, true, '1');
    expect(applyResult.applied).toBe(true);
    expect(applyResult.backup).toBeDefined();

    const content = readFileSync(agentPath, 'utf-8');
    expect(content).toMatch(/status:\s*BLOCKED/);
  });
});
