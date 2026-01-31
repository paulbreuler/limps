#!/usr/bin/env node
/**
 * Prepares package for publishing by copying LICENSE from repo root.
 * This script runs as part of the prepublishOnly hook (and in CI on npm publish).
 * License is derived from the root; the copied file is removed after publish by cleanup-publish.cjs.
 */

const fs = require('fs');
const path = require('path');

const packageDir = process.cwd();
const sourcePath = path.resolve(packageDir, '../../LICENSE');
const destPath = path.resolve(packageDir, 'LICENSE');

try {
  fs.copyFileSync(sourcePath, destPath);
  console.log('Copied LICENSE from repo root');
} catch (error) {
  console.error('Error copying LICENSE:', error.message);
  process.exit(1);
}
