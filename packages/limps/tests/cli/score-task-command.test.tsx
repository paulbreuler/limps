import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('score-task command UX', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-score-task-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createConfig(overrides: Record<string, unknown> = {}): string {
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = join(projectDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        plansPath: overrides.plansPath ?? join(testDir, 'plans'),
        dataPath: overrides.dataPath ?? join(testDir, 'data'),
        docsPaths: [testDir],
        fileExtensions: ['.md'],
        scoring: {
          weights: { dependency: 40, priority: 30, workload: 30 },
          biases: {},
        },
        ...overrides,
      })
    );
    return configPath;
  }

  it('shows helpful guidance when --plan/--agent are missing', async () => {
    const configPath = createConfig();
    const { default: ScoreTaskCommand } = await import('../../src/commands/plan/score.js');

    const { lastFrame } = render(<ScoreTaskCommand args={[]} options={{ config: configPath }} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('Error: --plan and --agent are required');
    expect(output).toContain('Usage: limps plan score --plan <plan> --agent <agent> [options]');
  });

  it('scores a task using --plan and --agent', async () => {
    const plansDir = join(testDir, 'plans');
    const planDir = join(plansDir, '0001-cli-ux');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, '000_agent_ready.agent.md'),
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

    const configPath = createConfig({ plansPath: plansDir });
    const { default: ScoreTaskCommand } = await import('../../src/commands/plan/score.js');

    const { lastFrame } = render(
      <ScoreTaskCommand args={[]} options={{ config: configPath, plan: '1', agent: '0' }} />
    );

    const output = lastFrame() ?? '';
    expect(output).toContain('Task Score (0001-cli-ux):');
    expect(output).toContain('Task ID: 0001-cli-ux#000');
    expect(output).toContain('Total Score:');
  });
});
