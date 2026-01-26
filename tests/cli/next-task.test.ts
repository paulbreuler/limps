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
import { readCoordination } from '../../src/coordination.js';
import type { ServerConfig } from '../../src/config.js';
import type { ParsedAgentFile, AgentFrontmatter } from '../../src/agent-parser.js';
import type { CoordinationState } from '../../src/coordination.js';

describe('next-task', () => {
  let testDir: string;
  let plansDir: string;
  let coordinationPath: string;
  let config: ServerConfig;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-cli-next-task-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    coordinationPath = join(testDir, 'coordination.json');
    mkdirSync(plansDir, { recursive: true });

    config = {
      plansPath: plansDir,
      dataPath: join(testDir, 'data'),
      coordinationPath,
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
    };

    // Initialize coordination state
    await readCoordination(coordinationPath);
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
      claimedBy: null,
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

  function createMockCoordination(overrides: Partial<CoordinationState> = {}): CoordinationState {
    return {
      version: 1,
      agents: {},
      tasks: {},
      fileLocks: {},
      ...overrides,
    };
  }

  describe('calculateDependencyScore', () => {
    it('returns 40 when no dependencies', () => {
      const agent = createMockAgent();
      const coordination = createMockCoordination();
      const allAgents = [agent];

      const result = calculateDependencyScore(agent, coordination, allAgents);

      expect(result.score).toBe(40);
      expect(result.reasons).toContain('No dependencies (unblocked)');
    });

    it('returns 40 when all dependencies satisfied', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          claimedBy: null,
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
          claimedBy: null,
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const coordination = createMockCoordination();
      const allAgents = [agent, depAgent];

      const result = calculateDependencyScore(agent, coordination, allAgents);

      expect(result.score).toBe(40);
    });

    it('returns 0 when dependencies not satisfied', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          claimedBy: null,
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
          claimedBy: null,
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const coordination = createMockCoordination();
      const allAgents = [agent, depAgent];

      const result = calculateDependencyScore(agent, coordination, allAgents);

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
          claimedBy: null,
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
          claimedBy: null,
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
      const coordination = createMockCoordination();
      const allAgents = [agent];

      const result = isTaskEligible(agent, coordination, allAgents);

      expect(result.eligible).toBe(true);
    });

    it('returns false for non-GAP status', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'WIP',
          persona: 'coder',
          claimedBy: null,
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const coordination = createMockCoordination();
      const allAgents = [agent];

      const result = isTaskEligible(agent, coordination, allAgents);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('WIP');
    });

    it('returns false when file is locked', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          claimedBy: null,
          dependencies: [],
          blocks: [],
          files: ['src/locked.ts'],
        },
      });
      const coordination = createMockCoordination({
        fileLocks: { 'src/locked.ts': 'other-agent' },
      });
      const allAgents = [agent];

      const result = isTaskEligible(agent, coordination, allAgents);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('locked');
    });

    it('returns false when dependency not satisfied', () => {
      const agent = createMockAgent({
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          claimedBy: null,
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
          claimedBy: null,
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const coordination = createMockCoordination();
      const allAgents = [agent, depAgent];

      const result = isTaskEligible(agent, coordination, allAgents);

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
          claimedBy: null,
          dependencies: [],
          blocks: [],
          files: [],
        },
      });
      const coordination = createMockCoordination();
      const allAgents = [agent];

      const result = scoreTask(agent, coordination, allAgents);

      expect(result).toBeNull();
    });

    it('returns score breakdown for eligible task', () => {
      const agent = createMockAgent();
      const coordination = createMockCoordination();
      const allAgents = [agent];

      const result = scoreTask(agent, coordination, allAgents);

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
claimedBy: null
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
claimedBy: null
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
claimedBy: null
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
claimedBy: null
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
});
