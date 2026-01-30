/**
 * Tests for component discovery.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverComponents } from '../src/audit/discover-components.js';

function mkdtemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'limps-headless-discovery-'));
}

describe('discoverComponents', () => {
  it('discovers components under default rootDir', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, 'sub'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'Button.tsx'),
      "export function Button() { return <button />; }\n",
      'utf-8'
    );
    fs.writeFileSync(
      path.join(root, 'Button.test.tsx'),
      "export function ButtonTest() { return <button />; }\n",
      'utf-8'
    );
    fs.writeFileSync(
      path.join(root, 'sub', 'Modal.tsx'),
      "export const Modal = () => <div />;\n",
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      expect(components.map((c) => c.name).sort()).toEqual(['Button', 'Modal']);
      expect(components.find((c) => c.name === 'Button')?.path).toBe(
        'src/components/Button.tsx'
      );
    } finally {
      process.chdir(cwd);
    }
  });
});
