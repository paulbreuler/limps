/**
 * Test setup file for Vitest.
 * Provides shared test fixtures and configuration.
 */

import { beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test directory for fixtures
const TEST_DIR = join(tmpdir(), 'mcp-test-repo');

beforeEach(async () => {
  // Create fresh test directory structure
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }

  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'addendums'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'examples'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'research'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'plans'), { recursive: true });

  // Override config to use test directory if needed
  // Note: Individual tests may override this with their own test directories
  if (!process.env.REPO_ROOT) {
    process.env.REPO_ROOT = TEST_DIR;
  }
});

afterEach(async () => {
  // Cleanup test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }

  // Reset env var if we set it
  if (process.env.REPO_ROOT === TEST_DIR) {
    delete process.env.REPO_ROOT;
  }
});
