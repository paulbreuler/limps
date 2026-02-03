/**
 * Tests for health-check aggregator (runHealthCheck, renderHealthCheckSummary).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runHealthCheck, renderHealthCheckSummary } from '../../src/cli/health-check.js';
import type { ServerConfig } from '../../src/config.js';

describe('health-check', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-health-check-${Date.now()}`);
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
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('returns summary with zero counts when no plans', () => {
    const result = runHealthCheck(config);
    expect(result.summary.staleCount).toBe(0);
    expect(result.summary.inferenceSuggestions).toBe(0);
    expect(result.summary.driftCount).toBe(0);
    expect(result.inference.plansChecked).toBe(0);
  });

  it('aggregates staleness and inference for a plan', () => {
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

Blocked on review.
`,
      'utf-8'
    );

    const result = runHealthCheck(config, { planId: '1' });
    expect(result.staleness.stale.length).toBeGreaterThanOrEqual(0);
    expect(result.inference.plansChecked).toBe(1);
    expect(result.inference.suggestionsCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.inferenceSuggestions).toBe(result.inference.suggestionsCount);
  });

  it('calls onComplete hook when provided', () => {
    let received: unknown = null;
    runHealthCheck(config, {
      onComplete: (r) => {
        received = r;
      },
    });
    expect(received).not.toBeNull();
    expect((received as { summary: { staleCount: number } }).summary.staleCount).toBe(0);
  });

  it('renderHealthCheckSummary returns a string', () => {
    const result = runHealthCheck(config);
    const text = renderHealthCheckSummary(result);
    expect(text).toContain('Health:');
    expect(text).toContain('stale');
    expect(text).toContain('status suggestions');
    expect(text).toContain('drift');
  });
});
