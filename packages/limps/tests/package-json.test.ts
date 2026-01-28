import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('package-json', () => {
  const packageJsonPath = join(__dirname, '..', 'package.json');

  it('should exist', () => {
    expect(() => readFileSync(packageJsonPath, 'utf-8')).not.toThrow();
  });

  it('should have correct dependencies', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    expect(packageJson.dependencies).toHaveProperty('@modelcontextprotocol/sdk');
    expect(packageJson.dependencies).toHaveProperty('zod');
    expect(packageJson.dependencies).toHaveProperty('better-sqlite3');
    expect(packageJson.dependencies).toHaveProperty('chokidar');
  });

  it('should have correct devDependencies', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    expect(packageJson.devDependencies).toHaveProperty('typescript');
    expect(packageJson.devDependencies).toHaveProperty('vitest');
    expect(packageJson.devDependencies).toHaveProperty('@types/node');
    expect(packageJson.devDependencies).toHaveProperty('@types/better-sqlite3');
  });

  it('should have type module', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    expect(packageJson.type).toBe('module');
  });

  it('should have test script', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    expect(packageJson.scripts).toHaveProperty('test');
  });
});
