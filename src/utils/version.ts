/**
 * Version utilities for reading package.json information.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to package.json relative to this module.
 */
function getPackageJsonPath(): string {
  return join(__dirname, '..', '..', 'package.json');
}

/**
 * Read and parse package.json.
 */
function readPackageJson(): { name: string; version: string } {
  const packageJsonPath = getPackageJsonPath();
  const content = readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Get the current package version from package.json.
 *
 * @returns The version string (e.g., "1.0.2")
 */
export function getPackageVersion(): string {
  const pkg = readPackageJson();
  return pkg.version;
}

/**
 * Get the package name from package.json.
 *
 * @returns The package name (e.g., "@sudosandwich/limps")
 */
export function getPackageName(): string {
  const pkg = readPackageJson();
  return pkg.name;
}
