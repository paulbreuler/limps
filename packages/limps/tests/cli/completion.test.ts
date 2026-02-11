import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getCompletionSuggestions, getCompletionScript } from '../../src/core/completion.js';

describe('completion engine', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-completion-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it('suggests grouped top-level commands', () => {
    const suggestions = getCompletionSuggestions(['']);
    expect(suggestions).toContain('plan');
    expect(suggestions).toContain('docs');
    expect(suggestions).toContain('server');
  });

  it('suggests plan subcommands', () => {
    const suggestions = getCompletionSuggestions(['plan', '']);
    expect(suggestions).toContain('list');
    expect(suggestions).toContain('score');
    expect(suggestions).toContain('scores');
  });

  it('suggests plans and agents for plan score options', () => {
    const plansDir = join(testDir, 'plans');
    const planDir = join(plansDir, '0001-completion-demo');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, '000_agent_one.agent.md'),
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

    const configPath = createConfig({ plansPath: plansDir });

    const planSuggestions = getCompletionSuggestions(['plan', 'score', '--plan', ''], {
      configPath,
    });
    expect(planSuggestions).toContain('0001-completion-demo');

    const agentSuggestions = getCompletionSuggestions(
      ['plan', 'score', '--plan', '1', '--agent', ''],
      { configPath }
    );
    expect(agentSuggestions).toContain('000');
  });

  it('uses --config from typed tokens for plan suggestions', () => {
    const plansDir = join(testDir, 'plans');
    mkdirSync(join(plansDir, '0001-token-config', 'agents'), { recursive: true });
    const configPath = createConfig({ plansPath: plansDir });

    const suggestions = getCompletionSuggestions(['plan', 'next', '--config', configPath, ''], {});

    expect(suggestions).toContain('0001-token-config');
  });

  it('does not suggest non-existent subgroup commands', () => {
    const healthSuggestions = getCompletionSuggestions(['health', '']);
    const proposalSuggestions = getCompletionSuggestions(['proposals', '']);

    expect(healthSuggestions).not.toContain('drift');
    expect(proposalSuggestions).not.toContain('list');
  });

  it('returns shell scripts for completion setup', () => {
    const zsh = getCompletionScript('zsh');
    const bash = getCompletionScript('bash');
    const fish = getCompletionScript('fish');

    expect(zsh).toContain('LIMPS_COMPLETE=1 limps --');
    expect(bash).toContain('LIMPS_COMPLETE=1 limps --');
    expect(fish).toContain('env LIMPS_COMPLETE=1 limps --');
    expect(zsh).toContain('compdef _limps limps');
    expect(bash).toContain('complete -F _limps_completion limps');
    expect(fish).toContain("complete -c limps -f -a '(__limps_complete)'");
  });
});
