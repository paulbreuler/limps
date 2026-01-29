#!/usr/bin/env node
/**
 * Prepares package for publishing by copying README.md and LICENSE from repo root.
 * This script runs as part of the prepublishOnly hook.
 */

const fs = require('fs');
const path = require('path');

const filesToCopy = [
  { from: '../../README.md', to: 'README.md' },
  { from: '../../LICENSE', to: 'LICENSE' },
];

const packageDir = process.cwd();

for (const { from, to } of filesToCopy) {
  const sourcePath = path.resolve(packageDir, from);
  const destPath = path.resolve(packageDir, to);

  try {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${from} to ${to}`);
  } catch (error) {
    console.error(`Error copying ${from} to ${to}:`, error.message);
    process.exit(1);
  }
}
