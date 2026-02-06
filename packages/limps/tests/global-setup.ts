/**
 * Vitest global setup — runs once before the entire test suite.
 * Ensures dist/ is up-to-date so e2e tests that spawn CLI/server
 * processes from dist/ always run against the latest source.
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

export function setup(): void {
  console.log('[global-setup] Building dist/ before tests...');
  execSync('npx tsc', { cwd: packageRoot, stdio: 'inherit' });
}
