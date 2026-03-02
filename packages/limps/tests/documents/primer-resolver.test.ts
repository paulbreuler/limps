import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolvePrimer } from '../../src/documents/primer-resolver.js';

describe('resolvePrimer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `primer-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return override path content when provided', () => {
    const primerPath = join(tempDir, 'PRIMER.md');
    writeFileSync(primerPath, '# Custom Primer\nContent here.');
    const result = resolvePrimer(tempDir, {}, primerPath);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('Custom Primer');
    expect(result?.source).toBe('override');
  });

  it('should auto-detect PRIMER.md in plan dir', () => {
    const primerPath = join(tempDir, 'PRIMER.md');
    writeFileSync(primerPath, '# Plan Primer\nPlan context here.');
    const result = resolvePrimer(tempDir, {});
    expect(result).not.toBeNull();
    expect(result?.content).toContain('Plan Primer');
    expect(result?.source).toBe('plan');
  });

  it('should use config primerPath as fallback', () => {
    const globalPrimer = join(tempDir, 'global-primer.md');
    writeFileSync(globalPrimer, '# Global Primer');
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir);
    const result = resolvePrimer(emptyDir, { primerPath: globalPrimer });
    expect(result).not.toBeNull();
    expect(result?.content).toContain('Global Primer');
    expect(result?.source).toBe('config');
  });

  it('should return null if no primer found', () => {
    const result = resolvePrimer(tempDir, {});
    expect(result).toBeNull();
  });

  it('should prioritize override over plan-local', () => {
    const overridePath = join(tempDir, 'override.md');
    writeFileSync(overridePath, '# Override');
    writeFileSync(join(tempDir, 'PRIMER.md'), '# Plan');
    const result = resolvePrimer(tempDir, {}, overridePath);
    expect(result?.source).toBe('override');
  });
});
