import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  nextTask,
  calculateDependencyScore,
  calculatePriorityScore,
  calculateWorkloadScore,
  isTaskEligible,
  scoreTask,
} from '../../src/cli/next-task.js';
import type { ServerConfig } from '../../src/config.js';
import { DEFAULT_SCORING_WEIGHTS, getScoringWeights } from '../../src/config.js';
import type { ParsedAgentFile, AgentFrontmatter } from '../../src/agent-parser.js';

describe('next-task', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-cli-next-task-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    mkdirSync(plansDir, { recursive: true });

    config = {
      plansPath: plansDir,
      dataPath: join(testDir, 'data'),
    };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createMockAgent(overrides: Partial<ParsedAgentFile> = {}): ParsedAgentFile {
    const frontmatter: AgentFrontmatter = {
      status: 'GAP',
      persona: 'coder',
      dependencies: [],
      blocks: [],
      files: [],
      ...overrides.frontmatter,
    };

    return {
      taskId: '0004-test-plan#000',
      planFolder: '0004-test-plan',
      agentNumber: '000',
      path: '/path/to/agent.md',
      frontmatter,
      content: '# Agent',
      mtime: new Date(),
      title: 'Test Agent',
      ...overrides,
    };
  }

  describe('calculateDependencyScore', () => {
    it('returns 40 when no dependencies', () => {
      const agent = createMockAgent();
      const allAgents = [agent];

      const result = calculateDependencyScore(agent, allAgents);

      expect(result.score).toBe(40);
      expect(result.reasons).toContain('No dependencies (unblocked)');
    });

    it('returns 40 when all dependencies satisfied', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          dependencies: ['001'],
          blocks: [],
          files: [],
        },
      });
      const depAgent = createMockAgent({
        agentNumber: '001',
        taskId: '0004-test-plan#001',
        frontmatter: {
          status: 'PASS',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const allAgents = [agent, depAgent];

      const result = calculateDependencyScore(agent, allAgents);

      expect(result.score).toBe(40);
    });

    it('returns 0 when dependencies not satisfied', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          dependencies: ['001'],
          blocks: [],
          files: [],
        },
      });
      const depAgent = createMockAgent({
        agentNumber: '001',
        taskId: '0004-test-plan#001',
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const allAgents = [agent, depAgent];

      const result = calculateDependencyScore(agent, allAgents);

      expect(result.score).toBe(0);
    });
  });

  describe('calculatePriorityScore', () => {
    it('returns 30 for agent 0', () => {
      const agent = createMockAgent({ agentNumber: '000' });

      const result = calculatePriorityScore(agent);

      expect(result.score).toBe(30);
    });

    it('returns 27 for agent 1', () => {
      const agent = createMockAgent({ agentNumber: '001' });

      const result = calculatePriorityScore(agent);

      expect(result.score).toBe(27);
    });

    it('returns 0 for agent 10+', () => {
      const agent = createMockAgent({ agentNumber: '010' });

      const result = calculatePriorityScore(agent);

      expect(result.score).toBe(0);
    });
  });

  describe('calculateWorkloadScore', () => {
    it('returns 30 for no files', () => {
      const agent = createMockAgent();

      const result = calculateWorkloadScore(agent);

      expect(result.score).toBe(30);
    });

    it('returns 25 for 1 file', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: ['src/a.ts'],
        },
      });

      const result = calculateWorkloadScore(agent);

      expect(result.score).toBe(25);
    });

    it('returns 0 for 6+ files', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
        },
      });

      const result = calculateWorkloadScore(agent);

      expect(result.score).toBe(0);
    });
  });

  describe('isTaskEligible', () => {
    it('returns true for GAP status with no conflicts', () => {
      const agent = createMockAgent();
      const allAgents = [agent];

      const result = isTaskEligible(agent, allAgents);

      expect(result.eligible).toBe(true);
    });

    it('returns false for non-GAP status', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'WIP',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const allAgents = [agent];

      const result = isTaskEligible(agent, allAgents);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('WIP');
    });

    it('returns false when dependency not satisfied', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          dependencies: ['001'],
          blocks: [],
          files: [],
        },
      });
      const depAgent = createMockAgent({
        agentNumber: '001',
        taskId: '0004-test-plan#001',
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const allAgents = [agent, depAgent];

      const result = isTaskEligible(agent, allAgents);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('not satisfied');
    });
  });

  describe('scoreTask', () => {
    it('returns null for ineligible task', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'WIP',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const allAgents = [agent];

      const result = scoreTask(agent, allAgents);

      expect(result).toBeNull();
    });

    it('returns score breakdown for eligible task', () => {
      const agent = createMockAgent();
      const allAgents = [agent];

      const result = scoreTask(agent, allAgents);

      expect(result).not.toBeNull();
      expect(result!.totalScore).toBe(100); // 40 + 30 + 30
      expect(result!.dependencyScore).toBe(40);
      expect(result!.priorityScore).toBe(30);
      expect(result!.workloadScore).toBe(30);
    });
  });

  describe('nextTask', () => {
    it('returns highest scored agent', async () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      // Agent 0 - higher priority
      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0: First Task
`,
        'utf-8'
      );

      // Agent 1 - lower priority
      writeFileSync(
        join(agentsDir, '001_agent.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 1: Second Task
`,
        'utf-8'
      );

      const output = await nextTask(config, '4');

      expect(output).toContain('0004-test-plan#000');
      expect(output).toContain('Score Breakdown');
      expect(output).toContain('Dependencies:');
      expect(output).toContain('Priority:');
      expect(output).toContain('Workload:');
    });

    it('shows all tasks completed message', async () => {
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

      const output = await nextTask(config, '4');

      expect(output).toContain('All tasks completed');
    });

    it('shows no available tasks message when all blocked', async () => {
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

# Agent 0
`,
        'utf-8'
      );

      const output = await nextTask(config, '4');

      expect(output).toContain('No available tasks');
    });

    it('handles plan not found', async () => {
      const result = await nextTask(config, '99');
      expect(result).toContain('Plan not found: 99');
    });
  });

  describe('configurable weights', () => {
    describe('getScoringWeights', () => {
      it('returns defaults when no scoring config', () => {
        const weights = getScoringWeights(config);

        expect(weights).toEqual(DEFAULT_SCORING_WEIGHTS);
        expect(weights.dependency).toBe(40);
        expect(weights.priority).toBe(30);
        expect(weights.workload).toBe(30);
      });

      it('applies custom weights from config', () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            weights: {
              dependency: 50,
              priority: 25,
              workload: 25,
            },
          },
        };

        const weights = getScoringWeights(customConfig);

        expect(weights.dependency).toBe(50);
        expect(weights.priority).toBe(25);
        expect(weights.workload).toBe(25);
      });

      it('allows partial weight overrides', () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            weights: {
              dependency: 60,
            },
          },
        };

        const weights = getScoringWeights(customConfig);

        expect(weights.dependency).toBe(60);
        expect(weights.priority).toBe(30); // default
        expect(weights.workload).toBe(30); // default
      });

      it('handles empty scoring object', () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {},
        };

        const weights = getScoringWeights(customConfig);

        expect(weights).toEqual(DEFAULT_SCORING_WEIGHTS);
      });
    });

    describe('calculateDependencyScore with custom maxScore', () => {
      it('uses custom maxScore when provided', () => {
        const agent = createMockAgent();
        const allAgents = [agent];

        const result = calculateDependencyScore(agent, allAgents, 50);

        expect(result.score).toBe(50);
      });

      it('returns custom maxScore when all dependencies satisfied', () => {
        const agent = createMockAgent({
          frontmatter: {
            status: 'GAP',
            persona: 'coder',
            dependencies: ['001'],
            blocks: [],
            files: [],
          },
        });
        const depAgent = createMockAgent({
          agentNumber: '001',
          taskId: '0004-test-plan#001',
          frontmatter: {
            status: 'PASS',
            persona: 'coder',
            dependencies: [],
            blocks: [],
            files: [],
          },
        });
        const allAgents = [agent, depAgent];

        const result = calculateDependencyScore(agent, allAgents, 60);

        expect(result.score).toBe(60);
      });
    });

    describe('calculatePriorityScore with custom maxScore', () => {
      it('uses custom maxScore for agent 0', () => {
        const agent = createMockAgent({ agentNumber: '000' });

        const result = calculatePriorityScore(agent, 50);

        expect(result.score).toBe(50);
        expect(result.reasons[0]).toContain('/50');
      });

      it('decrements proportionally with custom maxScore', () => {
        const agent = createMockAgent({ agentNumber: '001' });

        const result = calculatePriorityScore(agent, 50);

        // 50 - (1 * 5) = 45 (10% decrement per agent)
        expect(result.score).toBe(45);
      });
    });

    describe('calculateWorkloadScore with custom maxScore', () => {
      it('uses custom maxScore for no files', () => {
        const agent = createMockAgent();

        const result = calculateWorkloadScore(agent, 50);

        expect(result.score).toBe(50);
        expect(result.reasons[0]).toContain('/50');
      });

      it('decrements proportionally with custom maxScore', () => {
        const agent = createMockAgent({
          frontmatter: {
            status: 'GAP',
            persona: 'coder',
            dependencies: [],
            blocks: [],
            files: ['src/a.ts'],
          },
        });

        const result = calculateWorkloadScore(agent, 60);

        // 60 - (1 * 10) = 50 (1/6 of max per file)
        expect(result.score).toBe(50);
      });
    });

    describe('nextTask with custom weights', () => {
      it('displays custom weight totals in output', async () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            weights: {
              dependency: 50,
              priority: 25,
              workload: 25,
            },
          },
        };

        const planDir = join(plansDir, '0005-custom-weights');
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

# Agent 0: Custom Weights Test
`,
          'utf-8'
        );

        const output = await nextTask(customConfig, '5');

        expect(output).toContain('/100'); // total max (50+25+25)
        expect(output).toContain('/50'); // dependency max
        expect(output).toContain('/25'); // priority or workload max
      });
    });
  });
});
