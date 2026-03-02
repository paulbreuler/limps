import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('get_primer MCP tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `get-primer-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should import handler without errors', async () => {
    const { getPrimerHandler } = await import('../../src/tools/get-primer.js');
    expect(getPrimerHandler).toBeDefined();
    expect(typeof getPrimerHandler).toBe('function');
  });

  it('should return resolved:false when no primer exists', async () => {
    const { getPrimerHandler } = await import('../../src/tools/get-primer.js');
    const planDir = join(tempDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });

    const result = await getPrimerHandler(
      { planId: '0001-test-plan' },
      { config: { plansPath: tempDir } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.resolved).toBe(false);
    expect(parsed.source).toBe('none');
  });

  it('should resolve plan-local PRIMER.md', async () => {
    const { getPrimerHandler } = await import('../../src/tools/get-primer.js');
    const planDir = join(tempDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, 'PRIMER.md'), '# Primer content', 'utf-8');

    const result = await getPrimerHandler(
      { planId: '0001-test-plan' },
      { config: { plansPath: tempDir } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.resolved).toBe(true);
    expect(parsed.source).toBe('plan');
    expect(parsed.content).toContain('# Primer content');
  });

  it('should resolve override path when provided', async () => {
    const { getPrimerHandler } = await import('../../src/tools/get-primer.js');
    const planDir = join(tempDir, '0001-test-plan');
    mkdirSync(planDir, { recursive: true });
    const overridePath = join(tempDir, 'custom-primer.md');
    writeFileSync(overridePath, '# Custom primer', 'utf-8');

    const result = await getPrimerHandler(
      { planId: '0001-test-plan', overridePath },
      { config: { plansPath: tempDir } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.resolved).toBe(true);
    expect(parsed.source).toBe('override');
    expect(parsed.content).toContain('# Custom primer');
  });
});
