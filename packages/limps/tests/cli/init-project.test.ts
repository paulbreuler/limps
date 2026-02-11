import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initProject } from '../../src/cli/init-project.js';

describe('init-project', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  it('prints canonical server start command in next steps', () => {
    const projectDir = join(tmpdir(), `test-init-project-${Date.now()}`);
    tempDirs.push(projectDir);

    const output = initProject(projectDir);

    expect(output).toContain('server start --config');
    expect(output).toContain('server status --config');
    expect(output).toContain('server stop --config');
  });
});
