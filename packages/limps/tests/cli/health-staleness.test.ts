import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { getStalenessReport } from '../../src/cli/health-staleness.js';
import type { ServerConfig } from '../../src/config.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

describe('health staleness', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-staleness-${Date.now()}`);
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

  const writePlan = (planDir: string): string => {
    const planFile = join(planDir, `${basename(planDir)}-plan.md`);
    writeFileSync(
      planFile,
      `---
status: WIP
---

# Test Plan
`,
      'utf-8'
    );
    return planFile;
  };

  const writeAgent = (
    agentsDir: string,
    fileName: string,
    status: string,
    daysAgo: number
  ): void => {
    const filePath = join(agentsDir, fileName);
    writeFileSync(
      filePath,
      `---
status: ${status}
persona: coder
dependencies: []
blocks: []
files: []
---

# ${fileName}
`,
      'utf-8'
    );
    const mtime = new Date(Date.now() - daysAgo * MS_PER_DAY);
    utimesSync(filePath, mtime, mtime);
  };

  it('flags WIP agents as warning when stale', () => {
    const planDir = join(plansDir, '0033-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writePlan(planDir);

    writeAgent(agentsDir, '000_agent.agent.md', 'WIP', 8);

    const report = getStalenessReport(config);
    expect(report.stale).toHaveLength(1);
    expect(report.stale[0].severity).toBe('warning');
    expect(report.stale[0].type).toBe('agent');
  });

  it('flags plan as critical when last activity is too old', () => {
    const planDir = join(plansDir, '0033-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writePlan(planDir);

    writeAgent(agentsDir, '000_agent.agent.md', 'WIP', 40);

    const report = getStalenessReport(config);
    const planEntry = report.stale.find((entry) => entry.type === 'plan');
    expect(planEntry?.severity).toBe('critical');
  });

  it('excludes PASS agents by default', () => {
    const planDir = join(plansDir, '0033-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writePlan(planDir);

    writeAgent(agentsDir, '000_agent.agent.md', 'PASS', 40);
    writeAgent(agentsDir, '001_agent.agent.md', 'WIP', 40);

    const report = getStalenessReport(config);
    expect(report.stale.some((entry) => entry.status === 'PASS')).toBe(false);
    expect(report.stale.some((entry) => entry.status === 'WIP')).toBe(true);
  });
});
