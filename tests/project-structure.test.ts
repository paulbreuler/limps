import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('project-structure', () => {
  const projectRoot = join(__dirname, '..');

  it('should have server directory', () => {
    expect(existsSync(projectRoot)).toBe(true);
  });

  it('should have src directory', () => {
    expect(existsSync(join(projectRoot, 'src'))).toBe(true);
  });

  it('should have tests directory', () => {
    expect(existsSync(join(projectRoot, 'tests'))).toBe(true);
  });

  it('should have package.json', () => {
    expect(existsSync(join(projectRoot, 'package.json'))).toBe(true);
  });

  it('should have tsconfig.json', () => {
    expect(existsSync(join(projectRoot, 'tsconfig.json'))).toBe(true);
  });

  it('should have README.md', () => {
    expect(existsSync(join(projectRoot, 'README.md'))).toBe(true);
  });
});
