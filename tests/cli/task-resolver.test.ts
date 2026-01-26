import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  resolveTaskId,
  findPlansByPrefix,
  listAllPlans,
  AmbiguousTaskIdError,
} from '../../src/cli/task-resolver.js';

describe('task-resolver', () => {
  let testDir: string;
  let plansPath: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-task-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    plansPath = join(testDir, 'plans');
    mkdirSync(plansPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createPlan(planName: string, agents: string[]): void {
    const planDir = join(plansPath, planName);
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    for (const agent of agents) {
      const agentFile = join(agentsDir, agent);
      writeFileSync(agentFile, `---\nstatus: GAP\n---\n# Agent`, 'utf-8');
    }
  }

  describe('findPlansByPrefix', () => {
    it('finds plans matching prefix', () => {
      createPlan('0001-network-panel', ['000_agent.agent.md']);
      createPlan('0002-auth-system', ['000_agent.agent.md']);

      const result = findPlansByPrefix(plansPath, '0001');

      expect(result).toEqual(['0001-network-panel']);
    });

    it('finds multiple plans with same prefix', () => {
      createPlan('0001-feature-a', ['000_agent.agent.md']);
      createPlan('0001-feature-b', ['000_agent.agent.md']);

      const result = findPlansByPrefix(plansPath, '0001');

      expect(result).toHaveLength(2);
      expect(result).toContain('0001-feature-a');
      expect(result).toContain('0001-feature-b');
    });

    it('returns empty array for no matches', () => {
      createPlan('0001-network-panel', ['000_agent.agent.md']);

      const result = findPlansByPrefix(plansPath, '9999');

      expect(result).toEqual([]);
    });

    it('returns empty array for non-existent path', () => {
      const result = findPlansByPrefix('/nonexistent/path', '0001');

      expect(result).toEqual([]);
    });

    it('matches by number prefix only', () => {
      createPlan('0001-network-panel', ['000_agent.agent.md']);
      createPlan('0002-auth', ['000_agent.agent.md']);

      const result = findPlansByPrefix(plansPath, '1');

      expect(result).toEqual(['0001-network-panel']);
    });
  });

  describe('listAllPlans', () => {
    it('lists all valid plan directories', () => {
      createPlan('0001-network-panel', ['000_agent.agent.md']);
      createPlan('0002-auth-system', ['000_agent.agent.md']);

      const result = listAllPlans(plansPath);

      expect(result).toHaveLength(2);
      expect(result).toContain('0001-network-panel');
      expect(result).toContain('0002-auth-system');
    });

    it('filters out non-plan directories', () => {
      createPlan('0001-network-panel', ['000_agent.agent.md']);
      mkdirSync(join(plansPath, 'not-a-plan'), { recursive: true });

      const result = listAllPlans(plansPath);

      expect(result).toEqual(['0001-network-panel']);
    });

    it('returns empty array for non-existent path', () => {
      const result = listAllPlans('/nonexistent/path');

      expect(result).toEqual([]);
    });
  });

  describe('resolveTaskId', () => {
    describe('full task ID format', () => {
      it('resolves full task ID with exact plan name', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);

        const result = resolveTaskId('0001-network-panel#002', { plansPath });

        expect(result.planFolder).toBe('0001-network-panel');
        expect(result.agentNumber).toBe('002');
        expect(result.taskId).toBe('0001-network-panel#002');
        expect(result.path).toContain('002_agent_api.agent.md');
      });

      it('resolves task ID with plan prefix', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);

        const result = resolveTaskId('0001#002', { plansPath });

        expect(result.planFolder).toBe('0001-network-panel');
        expect(result.agentNumber).toBe('002');
      });

      it('resolves task ID with short agent number', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);

        const result = resolveTaskId('0001#2', { plansPath });

        expect(result.agentNumber).toBe('002');
      });

      it('throws for non-existent plan', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);

        expect(() => resolveTaskId('9999#002', { plansPath })).toThrow('Plan not found');
      });

      it('throws for non-existent agent', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);

        expect(() => resolveTaskId('0001#999', { plansPath })).toThrow('Agent 999 not found');
      });
    });

    describe('ambiguous prefix', () => {
      it('throws AmbiguousTaskIdError for multiple matches', () => {
        createPlan('0001-feature-a', ['000_agent.agent.md']);
        createPlan('0001-feature-b', ['000_agent.agent.md']);

        expect(() => resolveTaskId('0001#000', { plansPath })).toThrow(AmbiguousTaskIdError);
      });

      it('includes all matches in error', () => {
        createPlan('0001-feature-a', ['000_agent.agent.md']);
        createPlan('0001-feature-b', ['000_agent.agent.md']);

        try {
          resolveTaskId('0001#000', { plansPath });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AmbiguousTaskIdError);
          const ambiguousError = error as AmbiguousTaskIdError;
          expect(ambiguousError.matches).toContain('0001-feature-a');
          expect(ambiguousError.matches).toContain('0001-feature-b');
        }
      });
    });

    describe('agent-only format', () => {
      it('resolves agent number with plan context', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);

        const result = resolveTaskId('002', {
          plansPath,
          planContext: '0001-network-panel',
        });

        expect(result.planFolder).toBe('0001-network-panel');
        expect(result.agentNumber).toBe('002');
      });

      it('resolves short agent number with plan context', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);

        const result = resolveTaskId('2', {
          plansPath,
          planContext: '0001',
        });

        expect(result.agentNumber).toBe('002');
      });

      it('throws without plan context', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);

        expect(() => resolveTaskId('002', { plansPath })).toThrow('requires --plan context');
      });
    });

    describe('path format', () => {
      it('resolves from full path', () => {
        createPlan('0001-network-panel', ['002_agent_api.agent.md']);
        const fullPath = join(plansPath, '0001-network-panel', 'agents', '002_agent_api.agent.md');

        const result = resolveTaskId(fullPath, { plansPath });

        expect(result.planFolder).toBe('0001-network-panel');
        expect(result.agentNumber).toBe('002');
        expect(result.path).toBe(fullPath);
      });

      it('throws for non-existent path', () => {
        const fakePath = join(plansPath, '0001-fake', 'agents', '999_agent.agent.md');

        expect(() => resolveTaskId(fakePath, { plansPath })).toThrow('not found');
      });
    });

    describe('invalid formats', () => {
      it('throws for empty string', () => {
        expect(() => resolveTaskId('', { plansPath })).toThrow('Invalid task ID format');
      });

      it('throws for malformed task ID', () => {
        expect(() => resolveTaskId('invalid#', { plansPath })).toThrow('Invalid task ID format');
      });
    });
  });
});
