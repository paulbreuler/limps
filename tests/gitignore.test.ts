import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('gitignore', () => {
  const gitignorePath = join(__dirname, '..', '.gitignore');

  it('should exist', () => {
    expect(existsSync(gitignorePath)).toBe(true);
  });

  it('should exclude database files', () => {
    const gitignore = readFileSync(gitignorePath, 'utf-8');
    expect(gitignore).toMatch(/\.db/);
    expect(gitignore).toMatch(/\.sqlite/);
  });

  it('should exclude node_modules', () => {
    const gitignore = readFileSync(gitignorePath, 'utf-8');
    expect(gitignore).toMatch(/node_modules/);
  });

  it('should exclude coordination.json', () => {
    const gitignore = readFileSync(gitignorePath, 'utf-8');
    expect(gitignore).toMatch(/coordination\.json/);
  });
});
