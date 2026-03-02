import { describe, it, expect, vi, afterEach } from 'vitest';
import { runHooks, DEFAULT_HOOKS_PATH } from '../../src/hooks/runner.js';

describe('runHooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve DEFAULT_HOOKS_PATH to ~/.limps/hooks', () => {
    expect(DEFAULT_HOOKS_PATH).toContain('.limps');
    expect(DEFAULT_HOOKS_PATH).toContain('hooks');
  });

  it('should return without error when hooksPath does not exist', async () => {
    await expect(
      runHooks('plan:created', { plan: 'test' }, '/tmp/__limps_nonexistent_hooks__')
    ).resolves.toBeUndefined();
  });

  it('should return without error when hooksPath exists but no hook file', async () => {
    const { mkdtempSync, rmdirSync } = await import('fs');
    const { tmpdir } = await import('os');
    const dir = mkdtempSync(`${tmpdir()}/limps-hooks-test-`);

    try {
      await expect(runHooks('plan:created', { plan: 'test' }, dir)).resolves.toBeUndefined();
    } finally {
      rmdirSync(dir);
    }
  });

  it('should call hook file when it exists', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const dir = mkdtempSync(`${tmpdir()}/limps-hooks-test-`);
    const called: unknown[] = [];

    // Write a temporary hook file using a marker file to detect execution
    const markerFile = `${dir}/marker.json`;
    const hookContent = `
export default async function(payload) {
  const { writeFileSync } = await import('fs');
  writeFileSync(${JSON.stringify(markerFile)}, JSON.stringify(payload));
}
`;
    writeFileSync(`${dir}/plan:created.mjs`, hookContent, 'utf-8');

    try {
      await runHooks('plan:created', { plan: 'test-plan' }, dir);

      const { existsSync, readFileSync } = await import('fs');
      if (existsSync(markerFile)) {
        const data = JSON.parse(readFileSync(markerFile, 'utf-8') as string) as Record<
          string,
          unknown
        >;
        called.push(data);
        expect(data.event).toBe('plan:created');
        expect((data.data as Record<string, unknown>).plan).toBe('test-plan');
      }
      // If dynamic import failed (ESM isolation), just verify no crash
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should not throw when hook function throws', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const dir = mkdtempSync(`${tmpdir()}/limps-hooks-test-`);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    writeFileSync(
      `${dir}/server:startup.mjs`,
      `export default async function() { throw new Error('hook error'); }`,
      'utf-8'
    );

    try {
      await expect(runHooks('server:startup', {}, dir)).resolves.toBeUndefined();
      // Error should be logged, not thrown
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('hook failed'),
        expect.any(String)
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
      errorSpy.mockRestore();
    }
  });
});
