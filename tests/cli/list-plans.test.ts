import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listPlans } from '../../src/cli/list-plans.js';
import type { ServerConfig } from '../../src/config.js';

describe('list-plans', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-list-plans-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    mkdirSync(plansDir, { recursive: true });

    config = {
      plansPath: plansDir,
      dataPath: join(testDir, 'data'),
      coordinationPath: join(testDir, 'coordination.json'),
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
    };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('lists all plans in plansPath', () => {
    // Create test plan directories
    const plan1Dir = join(plansDir, '0001-feature-a');
    const plan2Dir = join(plansDir, '0002-bug-fix-b');
    mkdirSync(plan1Dir, { recursive: true });
    mkdirSync(plan2Dir, { recursive: true });

    writeFileSync(
      join(plan1Dir, 'plan.md'),
      `---
status: WIP
---
# Feature A

This is the overview for feature A.

## Details
`,
      'utf-8'
    );

    writeFileSync(
      join(plan2Dir, 'plan.md'),
      `# Bug Fix B

Fix the critical bug in the system.

## Steps
`,
      'utf-8'
    );

    const output = listPlans(config);

    expect(output).toContain('0001');
    expect(output).toContain('Feature A');
    expect(output).toContain('0002');
    expect(output).toContain('Bug Fix B');
    expect(output).toContain('Total: 2 plan(s)');
  });

  it('returns empty message when no plans', () => {
    const output = listPlans(config);

    expect(output).toContain('No plans found');
  });

  it('returns message when plans directory does not exist', () => {
    config.plansPath = join(testDir, 'nonexistent');

    const output = listPlans(config);

    expect(output).toContain('No plans found');
    expect(output).toContain('directory does not exist');
  });

  it('shows status icons correctly', () => {
    const gapPlan = join(plansDir, '0001-gap-plan');
    const wipPlan = join(plansDir, '0002-wip-plan');
    const passPlan = join(plansDir, '0003-pass-plan');
    const blockedPlan = join(plansDir, '0004-blocked-plan');

    mkdirSync(gapPlan, { recursive: true });
    mkdirSync(wipPlan, { recursive: true });
    mkdirSync(passPlan, { recursive: true });
    mkdirSync(blockedPlan, { recursive: true });

    writeFileSync(join(gapPlan, 'plan.md'), '---\nstatus: GAP\n---\n# Gap Plan\n');
    writeFileSync(join(wipPlan, 'plan.md'), '---\nstatus: WIP\n---\n# WIP Plan\n');
    writeFileSync(join(passPlan, 'plan.md'), '---\nstatus: PASS\n---\n# Pass Plan\n');
    writeFileSync(join(blockedPlan, 'plan.md'), '---\nstatus: BLOCKED\n---\n# Blocked Plan\n');

    const output = listPlans(config);

    expect(output).toContain('[ ]'); // GAP
    expect(output).toContain('[*]'); // WIP
    expect(output).toContain('[+]'); // PASS
    expect(output).toContain('[!]'); // BLOCKED
  });

  it('detects work type from directory name', () => {
    const featurePlan = join(plansDir, '0001-feature-login');
    const bugPlan = join(plansDir, '0002-bug-crash');
    const refactorPlan = join(plansDir, '0003-refactor-auth');

    mkdirSync(featurePlan, { recursive: true });
    mkdirSync(bugPlan, { recursive: true });
    mkdirSync(refactorPlan, { recursive: true });

    writeFileSync(join(featurePlan, 'plan.md'), '# Feature Login\n');
    writeFileSync(join(bugPlan, 'plan.md'), '# Bug Crash\n');
    writeFileSync(join(refactorPlan, 'plan.md'), '# Refactor Auth\n');

    const output = listPlans(config);

    expect(output).toContain('Type: feature');
    expect(output).toContain('Type: bug');
    expect(output).toContain('Type: refactor');
  });

  it('skips directories without plan number prefix', () => {
    const validPlan = join(plansDir, '0001-valid-plan');
    const invalidPlan = join(plansDir, 'invalid-no-number');

    mkdirSync(validPlan, { recursive: true });
    mkdirSync(invalidPlan, { recursive: true });

    writeFileSync(join(validPlan, 'plan.md'), '# Valid Plan\n');
    writeFileSync(join(invalidPlan, 'plan.md'), '# Invalid Plan\n');

    const output = listPlans(config);

    expect(output).toContain('Valid Plan');
    expect(output).not.toContain('Invalid Plan');
    expect(output).toContain('Total: 1 plan(s)');
  });

  it('sorts plans by number', () => {
    const plan10 = join(plansDir, '0010-plan-ten');
    const plan2 = join(plansDir, '0002-plan-two');
    const plan1 = join(plansDir, '0001-plan-one');

    mkdirSync(plan10, { recursive: true });
    mkdirSync(plan2, { recursive: true });
    mkdirSync(plan1, { recursive: true });

    writeFileSync(join(plan10, 'plan.md'), '# Plan Ten\n');
    writeFileSync(join(plan2, 'plan.md'), '# Plan Two\n');
    writeFileSync(join(plan1, 'plan.md'), '# Plan One\n');

    const output = listPlans(config);
    const lines = output.split('\n');

    const plan1Index = lines.findIndex((l) => l.includes('Plan One'));
    const plan2Index = lines.findIndex((l) => l.includes('Plan Two'));
    const plan10Index = lines.findIndex((l) => l.includes('Plan Ten'));

    expect(plan1Index).toBeLessThan(plan2Index);
    expect(plan2Index).toBeLessThan(plan10Index);
  });
});
