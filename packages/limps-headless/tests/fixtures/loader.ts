/**
 * Fixture loader for discovery tests.
 * Copies fixture directories to temp folders for isolated testing.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Copy a fixture directory to a temp folder.
 * @param fixtureName - Name of the fixture directory (e.g., 'radix', 'base', 'mixed')
 * @returns Path to the temp directory containing the fixture
 */
export function copyFixture(fixtureName: string): string {
  const fixtureDir = path.join(__dirname, fixtureName);
  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`Fixture not found: ${fixtureName} at ${fixtureDir}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `limps-headless-fixture-${fixtureName}-`));

  copyDirRecursive(fixtureDir, tempDir);
  return tempDir;
}

/**
 * Recursively copy a directory.
 */
function copyDirRecursive(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
