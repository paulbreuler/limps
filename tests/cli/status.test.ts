import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { status, getPlanStatusSummary } from '../../src/cli/status.js';
import type { ServerConfig } from '../../src/config.js';

describe('status', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-status-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    mkdirSync(plansDir, { recursive: true });

    config = {
      plansPath: plansDir,
      dataPath: join(testDir, 'data'),
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getPlanStatusSummary', () => {
    it('returns status summary with counts', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: PASS
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent.agent.md'),
        `---
status: WIP
persona: reviewer
dependencies: []
blocks: []
files: []
---

# Agent 1: In Progress
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '002_agent.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 2
`,
        'utf-8'
      );

      const summary = getPlanStatusSummary(config, '4');

      expect(summary.totalAgents).toBe(3);
      expect(summary.statusCounts.PASS).toBe(1);
      expect(summary.statusCounts.WIP).toBe(1);
      expect(summary.statusCounts.GAP).toBe(1);
      expect(summary.statusCounts.BLOCKED).toBe(0);
      expect(summary.personaCounts.coder).toBe(2);
      expect(summary.personaCounts.reviewer).toBe(1);
      expect(summary.completionPercentage).toBe(33);
      expect(summary.wipAgents).toHaveLength(1);
    });

    it('handles plan not found', () => {
      expect(() => getPlanStatusSummary(config, '99')).toThrow('Plan not found: 99');
    });

    it('tracks blocked agents', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: BLOCKED
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0: Blocked Task
`,
        'utf-8'
      );

      const summary = getPlanStatusSummary(config, '4');

      expect(summary.blockedAgents).toHaveLength(1);
      expect(summary.blockedAgents[0]).toContain('Blocked Task');
    });
  });

  describe('status output', () => {
    it('shows plan status summary', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: PASS
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 1
`,
        'utf-8'
      );

      const output = status(config, '4');

      expect(output).toContain('Plan Status:');
      expect(output).toContain('Total:');
      expect(output).toContain('Complete:');
      expect(output).toContain('Active:');
      expect(output).toContain('50%');
    });

    it('shows progress bar', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: PASS
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent.agent.md'),
        `---
status: PASS
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 1
`,
        'utf-8'
      );

      const output = status(config, '4');

      expect(output).toContain('Progress:');
      expect(output).toContain('[');
      expect(output).toContain(']');
      expect(output).toContain('100%');
    });

    it('shows in progress agents', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0: Active Work
`,
        'utf-8'
      );

      const output = status(config, '4');

      expect(output).toContain('In Progress:');
      expect(output).toContain('Active Work');
    });

    it('shows blocked agents', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: BLOCKED
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0: Waiting on External
`,
        'utf-8'
      );

      const output = status(config, '4');

      expect(output).toContain('Blocked:');
      expect(output).toContain('Waiting on External');
    });

    it('shows persona distribution', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent.agent.md'),
        `---
status: GAP
persona: reviewer
dependencies: []
blocks: []
files: []
---

# Agent 1
`,
        'utf-8'
      );

      const output = status(config, '4');

      expect(output).toContain('By Persona:');
      expect(output).toContain('coder: 1');
      expect(output).toContain('reviewer: 1');
    });

    it('handles plan not found', () => {
      expect(() => status(config, '99')).toThrow('Plan not found: 99');
    });
  });
});
