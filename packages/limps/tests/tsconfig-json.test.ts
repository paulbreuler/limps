import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('tsconfig-json', () => {
  const tsconfigPath = join(__dirname, '..', 'tsconfig.json');
  // In monorepo, base config is at root
  const tsconfigBasePath = join(__dirname, '..', '..', '..', 'tsconfig.base.json');

  it('should exist', () => {
    expect(() => readFileSync(tsconfigPath, 'utf-8')).not.toThrow();
  });

  it('should be valid JSON', () => {
    expect(() => JSON.parse(readFileSync(tsconfigPath, 'utf-8'))).not.toThrow();
  });

  it('should have compilerOptions', () => {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.compilerOptions).toBeDefined();
  });

  it('should extend base tsconfig', () => {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
  });

  it('should have module resolution in base config', () => {
    const tsconfigBase = JSON.parse(readFileSync(tsconfigBasePath, 'utf-8'));
    expect(tsconfigBase.compilerOptions.moduleResolution).toBeDefined();
  });

  it('should have strict mode enabled in base config', () => {
    const tsconfigBase = JSON.parse(readFileSync(tsconfigBasePath, 'utf-8'));
    expect(tsconfigBase.compilerOptions.strict).toBe(true);
  });

  it('should include src directory', () => {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.include).toContain('src/**/*');
  });
});
