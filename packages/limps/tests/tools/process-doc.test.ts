import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleProcessDoc } from '../../src/tools/process-doc.js';
import type { ToolContext } from '../../src/types.js';

function makeContext(plansPath: string): ToolContext {
  return {
    db: null as never,
    config: {
      plansPath,
      dataPath: join(plansPath, '../data'),
      scoring: { weights: { dependency: 40, priority: 30, workload: 30 }, biases: {} },
    },
  } as unknown as ToolContext;
}

describe('handleProcessDoc — security', () => {
  let tempDir: string;
  let plansDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `process-doc-sec-${Date.now()}`);
    plansDir = join(tempDir, 'plans');
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(join(plansDir, 'legit.md'), '# Legit\nThis is fine.');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should read a legitimate file within plans directory', async () => {
    const ctx = makeContext(plansDir);
    const result = await handleProcessDoc(
      {
        path: 'plans/legit.md',
        code: 'doc.content',
        timeout: 5000,
        max_depth: 1,
        allow_llm: false,
        llm_policy: 'auto',
        prettyPrint: false,
      },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as { result: unknown };
    expect(parsed.result).toContain('Legit');
  });

  it('should block symlink traversal — symlink inside plans pointing to /etc', async () => {
    // Create a symlink inside the plans dir pointing to /etc
    symlinkSync('/etc', join(plansDir, 'etc-link'));

    const ctx = makeContext(plansDir);
    const result = await handleProcessDoc(
      {
        path: 'plans/etc-link/passwd',
        code: 'doc.content',
        timeout: 5000,
        max_depth: 1,
        allow_llm: false,
        llm_policy: 'auto',
        prettyPrint: false,
      },
      ctx
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    // Must NOT contain /etc/passwd content
    expect(text).not.toContain('root:');
    expect(text).not.toContain('nobody:');
    expect(text).not.toContain('User Database');
    // Should contain a clear rejection reason
    expect(text.toLowerCase()).toMatch(/permission denied|symlink|security|outside/i);
  });

  it('should block symlink traversal — symlink pointing to parent directory', async () => {
    symlinkSync(join(tempDir, '..'), join(plansDir, 'parent-link'));

    const ctx = makeContext(plansDir);
    const result = await handleProcessDoc(
      {
        path: 'plans/parent-link/some-secret.txt',
        code: 'doc.content',
        timeout: 5000,
        max_depth: 1,
        allow_llm: false,
        llm_policy: 'auto',
        prettyPrint: false,
      },
      ctx
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text.toLowerCase()).toMatch(/permission denied|symlink|security|outside/i);
  });

  it('should block path traversal via ../', async () => {
    const ctx = makeContext(plansDir);
    const result = await handleProcessDoc(
      {
        path: '../../../etc/passwd',
        code: 'doc.content',
        timeout: 5000,
        max_depth: 1,
        allow_llm: false,
        llm_policy: 'auto',
        prettyPrint: false,
      },
      ctx
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).not.toContain('root:');
  });
});
