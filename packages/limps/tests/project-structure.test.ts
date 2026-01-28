import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('project-structure', () => {
  const packageRoot = join(__dirname, '..');
  // In monorepo, README.md is at the root
  const monorepoRoot = join(__dirname, '..', '..', '..');

  it('should have package directory', () => {
    expect(existsSync(packageRoot)).toBe(true);
  });

  it('should have src directory', () => {
    expect(existsSync(join(packageRoot, 'src'))).toBe(true);
  });

  it('should have tests directory', () => {
    expect(existsSync(join(packageRoot, 'tests'))).toBe(true);
  });

  it('should have package.json', () => {
    expect(existsSync(join(packageRoot, 'package.json'))).toBe(true);
  });

  it('should have tsconfig.json', () => {
    expect(existsSync(join(packageRoot, 'tsconfig.json'))).toBe(true);
  });

  it('should have README.md at monorepo root', () => {
    expect(existsSync(join(monorepoRoot, 'README.md'))).toBe(true);
  });
});
