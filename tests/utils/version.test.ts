import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPackageVersion, getPackageName } from '../../src/utils/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('version.ts', () => {
  describe('getPackageVersion', () => {
    it('should return the version from package.json', () => {
      const version = getPackageVersion();
      expect(version).toBeTruthy();
      expect(typeof version).toBe('string');

      // Verify it matches the actual package.json
      const packageJsonPath = join(__dirname, '..', '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      expect(version).toBe(packageJson.version);
    });

    it('should return a valid semver version', () => {
      const version = getPackageVersion();
      // Basic semver pattern check (major.minor.patch)
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('getPackageName', () => {
    it('should return the package name from package.json', () => {
      const name = getPackageName();
      expect(name).toBeTruthy();
      expect(typeof name).toBe('string');

      // Verify it matches the actual package.json
      const packageJsonPath = join(__dirname, '..', '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      expect(name).toBe(packageJson.name);
    });

    it('should return the scoped package name', () => {
      const name = getPackageName();
      expect(name).toBe('@sudosandwich/limps');
    });
  });
});
