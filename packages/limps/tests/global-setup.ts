/**
 * Vitest global setup — runs once before the entire test suite.
 * Builds dist/ only when it is missing or stale (src/ has newer files).
 * Set LIMPS_SKIP_BUILD=true to skip the build entirely for fast iteration.
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

/** Recursively find the newest file mtime (epoch ms) under a directory. */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full));
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

function isDistStale(): boolean {
  const distDir = join(packageRoot, 'dist');
  if (!existsSync(distDir)) {
    return true;
  }

  return newestMtime(join(packageRoot, 'src')) > newestMtime(distDir);
}

export function setup(): void {
  if (process.env.LIMPS_SKIP_BUILD === 'true') {
    return;
  }

  if (!isDistStale()) {
    return;
  }

  console.log('[global-setup] Building dist/ before tests...');
  execSync('npx tsc', { cwd: packageRoot, stdio: 'inherit' });
}
