import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('tsconfig-json', () => {
  const tsconfigPath = join(__dirname, '..', 'tsconfig.json');

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

  it('should have module resolution', () => {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.compilerOptions.moduleResolution).toBeDefined();
  });

  it('should have strict mode enabled', () => {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('should include src directory', () => {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.include).toContain('src/**/*');
  });
});
