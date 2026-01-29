#!/usr/bin/env node
/**
 * Cleans up temporary files created during publish.
 * This script runs as part of the postpublish hook.
 */

const fs = require('fs');
const path = require('path');

const filesToRemove = ['README.md', 'LICENSE'];

const packageDir = process.cwd();

for (const file of filesToRemove) {
  const filePath = path.resolve(packageDir, file);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Removed ${file}`);
    }
  } catch (error) {
    // Ignore errors - file might not exist or might be read-only
    console.warn(`Warning: Could not remove ${file}:`, error.message);
  }
}
