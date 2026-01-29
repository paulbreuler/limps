#!/usr/bin/env node
/**
 * Prepares package for publishing by copying LICENSE from repo root.
 * This script runs as part of the prepublishOnly hook.
 * 
 * Note: limps-radix already has a LICENSE file in git, but we copy from root
 * to ensure it stays in sync. The postpublish script does NOT delete it
 * since it's a real file in the repository.
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
