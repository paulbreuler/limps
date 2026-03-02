import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('validate_invest MCP tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `validate-invest-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should import handler without errors', async () => {
    const { validateInvestHandler } = await import('../../src/tools/validate-invest.js');
    expect(validateInvestHandler).toBeDefined();
    expect(typeof validateInvestHandler).toBe('function');
  });

  it('should return error when task file not found', async () => {
    const { validateInvestHandler } = await import('../../src/tools/validate-invest.js');

    const result = await validateInvestHandler(
      { taskId: '0001-nonexistent#999' },
      { config: { plansPath: tempDir } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('not found');
  });

  it('should validate an agent file and return INVEST report', async () => {
    const { validateInvestHandler } = await import('../../src/tools/validate-invest.js');

    // Create plan with agent
    const planDir = join(tempDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    const agentContent = `---
type: agent
status: GAP
persona: coder
title: Add login form
dependencies: []
files:
  - src/login.ts
  - src/login.test.ts
---

# Agent: Add login form

## Task

Implement the login form with email and password fields.

## Acceptance Criteria

- [ ] Login form renders with email input
- [ ] Login form renders with password input
- [ ] Form validates required fields

## Files to Modify

- \`src/login.ts\`
- \`src/login.test.ts\`

## Verification

\`\`\`bash
npm test -- --grep login
\`\`\`
`;
    writeFileSync(join(agentsDir, '002-add-login-form.md'), agentContent, 'utf-8');

    const result = await validateInvestHandler(
      { taskId: '0001-test-plan#002' },
      { config: { plansPath: tempDir } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.taskId).toBe('0001-test-plan#002');
    expect(parsed.score).toBeGreaterThanOrEqual(60);
    expect(parsed.pass).toBe(true);
    expect(parsed.criteria).toBeDefined();
    expect(parsed.criteria.independent).toBe(true);
    expect(parsed.criteria.testable).toBe(true);
  });
});
