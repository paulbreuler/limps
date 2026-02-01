import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  nextTask,
  calculateDependencyScore,
  calculatePriorityScore,
  calculateWorkloadScore,
  calculateBiasScore,
  getScoredTasksData,
  getScoredTaskById,
  isTaskEligible,
  scoreTask,
} from '../../src/cli/next-task.js';
import type { ServerConfig } from '../../src/config.js';
import {
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SCORING_BIASES,
  getScoringWeights,
  getScoringBiases,
} from '../../src/config.js';
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
      scoring: {
        weights: DEFAULT_SCORING_WEIGHTS,
        biases: DEFAULT_SCORING_BIASES,
      },
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

      const result = scoreTask(agent, allAgents, DEFAULT_SCORING_WEIGHTS, DEFAULT_SCORING_BIASES);

      expect(result).toBeNull();
    });

    it('returns score breakdown for eligible task', () => {
      const agent = createMockAgent();
      const allAgents = [agent];

      const result = scoreTask(agent, allAgents, DEFAULT_SCORING_WEIGHTS, DEFAULT_SCORING_BIASES);

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

  describe('score-task and score-all helpers', () => {
    it('returns scored tasks sorted by total score', () => {
      const planDir = join(plansDir, '0009-score-all');
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

# Agent 0: High Priority
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

# Agent 1: Lower Priority
`,
        'utf-8'
      );

      const result = getScoredTasksData(config, '9');
      expect('error' in result).toBe(false);
      if ('error' in result) {
        return;
      }
      expect(result.tasks[0].taskId).toContain('#000');
    });

    it('returns error for ineligible score-task', () => {
      const planDir = join(plansDir, '0010-score-task');
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

# Agent 0: In Progress
`,
        'utf-8'
      );

      const result = getScoredTaskById(config, '0010-score-task#000');
      expect('error' in result).toBe(true);
    });

    it('returns score for eligible score-task', () => {
      const planDir = join(plansDir, '0011-score-task');
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

# Agent 0: Ready
`,
        'utf-8'
      );

      const result = getScoredTaskById(config, '0011-score-task#000');
      expect('error' in result).toBe(false);
      if ('error' in result) {
        return;
      }
      expect(result.task.taskId).toBe('0011-score-task#000');
    });
  });

  describe('configurable weights', () => {
    describe('getScoringWeights', () => {
      it('applies custom weights from config', () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            weights: {
              dependency: 50,
              priority: 25,
              workload: 25,
            },
            biases: DEFAULT_SCORING_BIASES,
          },
        };

        const weights = getScoringWeights(customConfig);

        expect(weights.dependency).toBe(50);
        expect(weights.priority).toBe(25);
        expect(weights.workload).toBe(25);
      });

      it('applies preset weights when configured', () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            preset: 'quick-wins',
            weights: {},
            biases: DEFAULT_SCORING_BIASES,
          },
        };

        const weights = getScoringWeights(customConfig);

        expect(weights.dependency).toBe(20);
        expect(weights.priority).toBe(20);
        expect(weights.workload).toBe(60);
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
            biases: DEFAULT_SCORING_BIASES,
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

  describe('configurable biases', () => {
    describe('getScoringBiases', () => {
      it('applies custom biases from config', () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            weights: DEFAULT_SCORING_WEIGHTS,
            biases: {
              plans: { '0004-test-plan': 20 },
              personas: { coder: 10 },
              statuses: { GAP: 5 },
            },
          },
        };

        const biases = getScoringBiases(customConfig);

        expect(biases.plans?.['0004-test-plan']).toBe(20);
        expect(biases.personas?.coder).toBe(10);
        expect(biases.statuses?.GAP).toBe(5);
      });

      it('applies preset biases when configured', () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            preset: 'code-then-review',
            weights: DEFAULT_SCORING_WEIGHTS,
            biases: {},
          },
        };

        const biases = getScoringBiases(customConfig);

        expect(biases.personas?.coder).toBe(10);
        expect(biases.personas?.reviewer).toBe(-10);
      });

      it('adds plan bias from plan frontmatter priority/severity', () => {
        const planDir = join(plansDir, '0012-plan-bias');
        const agentsDir = join(planDir, 'agents');
        mkdirSync(agentsDir, { recursive: true });

        writeFileSync(
          join(planDir, '0012-plan-bias-plan.md'),
          `---
priority: high
severity: medium
---

# Plan 12
`,
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
---

# Agent 0
`,
          'utf-8'
        );

        const result = getScoredTasksData(config, '12');
        expect('error' in result).toBe(false);
        if ('error' in result) {
          return;
        }
        expect(result.tasks[0].biasScore).toBe(15);
        expect(result.tasks[0].totalScore).toBe(115);
      });

      it('ignores malformed plan frontmatter and suggests repair', () => {
        const planDir = join(plansDir, '0013-plan-bias-repair');
        const agentsDir = join(planDir, 'agents');
        mkdirSync(agentsDir, { recursive: true });

        writeFileSync(
          join(planDir, '0013-plan-bias-repair-plan.md'),
          `---
priority: high
severity: medium
invalid: [oops
---

# Plan 13
`,
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
---

# Agent 0
`,
          'utf-8'
        );

        const result = getScoredTasksData(config, '13');
        expect('error' in result).toBe(false);
        if ('error' in result) {
          return;
        }
        expect(result.tasks[0].biasScore).toBe(0);
      });

      it('returns empty biases when none are configured', () => {
        const biases = getScoringBiases(config);

        expect(biases).toEqual({});
      });

      it('keeps only configured bias groups', () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            weights: DEFAULT_SCORING_WEIGHTS,
            biases: {
              personas: { reviewer: -10 },
            },
          },
        };

        const biases = getScoringBiases(customConfig);

        expect(biases.personas?.reviewer).toBe(-10);
        expect(biases.plans).toBeUndefined();
        expect(biases.statuses).toBeUndefined();
      });
    });

    describe('calculateBiasScore', () => {
      it('returns 0 when no biases configured', () => {
        const agent = createMockAgent();

        const result = calculateBiasScore(agent, {});

        expect(result.score).toBe(0);
        expect(result.reasons).toHaveLength(0);
      });

      it('applies positive plan bias', () => {
        const agent = createMockAgent({ planFolder: '0004-test-plan' });

        const result = calculateBiasScore(agent, {
          plans: { '0004-test-plan': 20 },
        });

        expect(result.score).toBe(20);
        expect(result.reasons).toContain('Plan bias: +20');
      });

      it('applies negative plan bias', () => {
        const agent = createMockAgent({ planFolder: '0004-test-plan' });

        const result = calculateBiasScore(agent, {
          plans: { '0004-test-plan': -15 },
        });

        expect(result.score).toBe(-15);
        expect(result.reasons).toContain('Plan bias: -15');
      });

      it('ignores unknown plan', () => {
        const agent = createMockAgent({ planFolder: '0004-test-plan' });

        const result = calculateBiasScore(agent, {
          plans: { '0005-other-plan': 20 },
        });

        expect(result.score).toBe(0);
        expect(result.reasons).toHaveLength(0);
      });

      it('applies positive persona bias for coder', () => {
        const agent = createMockAgent({
          frontmatter: {
            status: 'GAP',
            persona: 'coder',
            dependencies: [],
            blocks: [],
            files: [],
          },
        });

        const result = calculateBiasScore(agent, {
          personas: { coder: 15 },
        });

        expect(result.score).toBe(15);
        expect(result.reasons).toContain('Persona bias (coder): +15');
      });

      it('applies negative persona bias for reviewer', () => {
        const agent = createMockAgent({
          frontmatter: {
            status: 'GAP',
            persona: 'reviewer',
            dependencies: [],
            blocks: [],
            files: [],
          },
        });

        const result = calculateBiasScore(agent, {
          personas: { reviewer: -10 },
        });

        expect(result.score).toBe(-10);
        expect(result.reasons).toContain('Persona bias (reviewer): -10');
      });

      it('ignores unknown persona', () => {
        const agent = createMockAgent({
          frontmatter: {
            status: 'GAP',
            persona: 'coder',
            dependencies: [],
            blocks: [],
            files: [],
          },
        });

        const result = calculateBiasScore(agent, {
          personas: { reviewer: -10 },
        });

        expect(result.score).toBe(0);
        expect(result.reasons).toHaveLength(0);
      });

      it('applies status bias for GAP', () => {
        const agent = createMockAgent({
          frontmatter: {
            status: 'GAP',
            persona: 'coder',
            dependencies: [],
            blocks: [],
            files: [],
          },
        });

        const result = calculateBiasScore(agent, {
          statuses: { GAP: 5 },
        });

        expect(result.score).toBe(5);
        expect(result.reasons).toContain('Status bias (GAP): +5');
      });

      it('combines multiple biases', () => {
        const agent = createMockAgent({
          planFolder: '0004-test-plan',
          frontmatter: {
            status: 'GAP',
            persona: 'coder',
            dependencies: [],
            blocks: [],
            files: [],
          },
        });

        const result = calculateBiasScore(agent, {
          plans: { '0004-test-plan': 20 },
          personas: { coder: 10 },
          statuses: { GAP: 5 },
        });

        expect(result.score).toBe(35); // 20 + 10 + 5
        expect(result.reasons).toHaveLength(3);
        expect(result.reasons).toContain('Plan bias: +20');
        expect(result.reasons).toContain('Persona bias (coder): +10');
        expect(result.reasons).toContain('Status bias (GAP): +5');
      });
    });

    describe('scoreTask with biases', () => {
      it('includes biasScore in result', () => {
        const agent = createMockAgent({ planFolder: '0004-test-plan' });
        const allAgents = [agent];
        const biases = { plans: { '0004-test-plan': 10 } };

        const result = scoreTask(agent, allAgents, DEFAULT_SCORING_WEIGHTS, biases);

        expect(result).not.toBeNull();
        expect(result!.biasScore).toBe(10);
        expect(result!.totalScore).toBe(110); // 100 + 10
      });

      it('floors total score at 0 with negative bias', () => {
        const agent = createMockAgent({ planFolder: '0004-test-plan' });
        const allAgents = [agent];
        const biases = { plans: { '0004-test-plan': -200 } };

        const result = scoreTask(agent, allAgents, DEFAULT_SCORING_WEIGHTS, biases);

        expect(result).not.toBeNull();
        expect(result!.biasScore).toBe(-200);
        expect(result!.totalScore).toBe(0); // floored at 0
      });

      it('includes bias reasons in result', () => {
        const agent = createMockAgent({
          planFolder: '0004-test-plan',
          frontmatter: {
            status: 'GAP',
            persona: 'coder',
            dependencies: [],
            blocks: [],
            files: [],
          },
        });
        const allAgents = [agent];
        const biases = {
          plans: { '0004-test-plan': 20 },
          personas: { coder: 10 },
        };

        const result = scoreTask(agent, allAgents, DEFAULT_SCORING_WEIGHTS, biases);

        expect(result).not.toBeNull();
        expect(result!.reasons).toContain('Plan bias: +20');
        expect(result!.reasons).toContain('Persona bias (coder): +10');
      });
    });

    describe('nextTask with biases', () => {
      it('displays bias score in output when non-zero', async () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            weights: DEFAULT_SCORING_WEIGHTS,
            biases: {
              plans: { '0006-bias-test': 15 },
            },
          },
        };

        const planDir = join(plansDir, '0006-bias-test');
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

# Agent 0: Bias Test
`,
          'utf-8'
        );

        const output = await nextTask(customConfig, '6');

        expect(output).toContain('Bias: +15');
        expect(output).toContain('(with bias)');
      });

      it('does not display bias line when bias is zero', async () => {
        const planDir = join(plansDir, '0007-no-bias');
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

# Agent 0: No Bias Test
`,
          'utf-8'
        );

        const output = await nextTask(config, '7');

        expect(output).not.toContain('Bias:');
        expect(output).not.toContain('(with bias)');
      });

      it('affects task ranking with positive bias', async () => {
        const customConfig: ServerConfig = {
          ...config,
          scoring: {
            weights: DEFAULT_SCORING_WEIGHTS,
            biases: {
              personas: { reviewer: 50 },
            },
          },
        };

        const planDir = join(plansDir, '0008-ranking-test');
        const agentsDir = join(planDir, 'agents');
        mkdirSync(agentsDir, { recursive: true });

        // Agent 0 - coder (no bias, higher priority)
        writeFileSync(
          join(agentsDir, '000_agent.agent.md'),
          `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0: Coder Task
`,
          'utf-8'
        );

        // Agent 1 - reviewer (with +50 bias, lower priority)
        writeFileSync(
          join(agentsDir, '001_agent.agent.md'),
          `---
status: GAP
persona: reviewer
dependencies: []
blocks: []
files: []
---

# Agent 1: Reviewer Task
`,
          'utf-8'
        );

        const output = await nextTask(customConfig, '8');

        // With +50 bias, reviewer (agent 1) should win:
        // Agent 0: 40 + 30 + 30 + 0 = 100
        // Agent 1: 40 + 27 + 30 + 50 = 147
        expect(output).toContain('0008-ranking-test#001');
        expect(output).toContain('Reviewer Task');
      });
    });
  });

  describe('frontmatter overrides', () => {
    it('applies plan frontmatter weights override', () => {
      const planDir = join(plansDir, '0014-plan-weights');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(planDir, '0014-plan-weights-plan.md'),
        `---
scoring:
  weights:
    dependency: 60
    priority: 20
    workload: 20
---

# Plan 14
`,
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
---

# Agent 0
`,
        'utf-8'
      );

      const result = getScoredTasksData(config, '14');
      expect('error' in result).toBe(false);
      if ('error' in result) {
        return;
      }
      expect(result.tasks[0].weights).toEqual({
        dependency: 60,
        priority: 20,
        workload: 20,
      });
      expect(result.tasks[0].dependencyScore).toBe(60);
      expect(result.tasks[0].priorityScore).toBe(20);
      expect(result.tasks[0].workloadScore).toBe(20);
    });

    it('applies agent weights override on top of plan weights', () => {
      const planDir = join(plansDir, '0015-agent-weight-override');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(planDir, '0015-agent-weight-override-plan.md'),
        `---
scoring:
  weights:
    dependency: 60
    priority: 20
    workload: 20
---

# Plan 15
`,
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
scoring:
  weights:
    dependency: 10
---

# Agent 0
`,
        'utf-8'
      );

      const result = getScoredTasksData(config, '15');
      expect('error' in result).toBe(false);
      if ('error' in result) {
        return;
      }
      expect(result.tasks[0].weights).toEqual({
        dependency: 10,
        priority: 20,
        workload: 20,
      });
      expect(result.tasks[0].dependencyScore).toBe(10);
    });

    it('uses plan frontmatter bias over config plan bias', () => {
      const planDir = join(plansDir, '0016-plan-bias-override');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(planDir, '0016-plan-bias-override-plan.md'),
        `---
scoring:
  bias: -5
---

# Plan 16
`,
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
---

# Agent 0
`,
        'utf-8'
      );

      const customConfig: ServerConfig = {
        ...config,
        scoring: {
          weights: DEFAULT_SCORING_WEIGHTS,
          biases: {
            plans: { '0016-plan-bias-override': 20 },
          },
        },
      };

      const result = getScoredTasksData(customConfig, '16');
      expect('error' in result).toBe(false);
      if ('error' in result) {
        return;
      }
      expect(result.tasks[0].biasScore).toBe(-5);
      expect(result.tasks[0].totalScore).toBe(95);
    });

    it('stacks agent bias with plan bias', () => {
      const planDir = join(plansDir, '0017-bias-stack');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(planDir, '0017-bias-stack-plan.md'),
        `---
scoring:
  bias: 10
---

# Plan 17
`,
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
scoring:
  bias: 5
---

# Agent 0
`,
        'utf-8'
      );

      const result = getScoredTasksData(config, '17');
      expect('error' in result).toBe(false);
      if ('error' in result) {
        return;
      }
      expect(result.tasks[0].biasScore).toBe(15);
      expect(result.tasks[0].totalScore).toBe(115);
    });
  });

  describe('frontmatter warnings', () => {
    it('suppresses malformed plan warning when requested', () => {
      const planDir = join(plansDir, '0018-malformed-suppress');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(planDir, '0018-malformed-suppress-plan.md'),
        `---
scoring: [oops
---

# Plan 18
`,
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
---

# Agent 0
`,
        'utf-8'
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = getScoredTasksData(config, '18', { suppressWarnings: true });
      expect('error' in result).toBe(false);
      if ('error' in result) {
        warnSpy.mockRestore();
        return;
      }
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
