#!/usr/bin/env node
/**
 * Cleans up after publishing. Removes the LICENSE copied from root during prepublishOnly
 * so the package directory does not retain an untracked file.
 */

const fs = require('fs');
const path = require('path');

const packageDir = process.cwd();
const licensePath = path.resolve(packageDir, 'LICENSE');

try {
  if (fs.existsSync(licensePath)) {
    fs.unlinkSync(licensePath);
    console.log('Removed copied LICENSE');
  }
} catch (error) {
  console.error('Cleanup error:', error.message);
}
console.log('Cleanup complete');
