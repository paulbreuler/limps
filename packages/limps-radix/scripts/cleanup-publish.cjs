#!/usr/bin/env node
/**
 * Cleans up after publishing.
 * 
 * Note: For limps-radix, we do NOT delete LICENSE because it's a real file
 * checked into git. This script is kept for consistency but is a no-op.
 * The LICENSE file will remain in the directory after publishing.
 */

// No cleanup needed for limps-radix since LICENSE is a real file in the repo
console.log('Cleanup complete (no files to remove)');
