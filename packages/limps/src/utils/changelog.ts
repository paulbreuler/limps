/**
 * Changelog parsing utilities for extracting version entries.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to CHANGELOG.md relative to the project root.
 */
function getChangelogPath(): string {
  return join(__dirname, '..', '..', 'CHANGELOG.md');
}

/**
 * Normalize version string for comparison.
 * Removes brackets, 'v' prefix, and extra whitespace.
 * Examples: "[1.1.1]" -> "1.1.1", "v1.0.0" -> "1.0.0"
 */
function normalizeVersion(version: string): string {
  return version
    .replace(/^\[|\]$/g, '') // Remove brackets
    .replace(/^v/i, '') // Remove 'v' prefix
    .trim();
}

/**
 * Extract changelog entry for a specific version.
 * Parses CHANGELOG.md and returns the content for the given version.
 *
 * @param version - Version string to look for (e.g., "1.1.1")
 * @returns Changelog entry text, or null if not found
 */
export function getChangelogForVersion(version: string): string | null {
  const changelogPath = getChangelogPath();

  if (!existsSync(changelogPath)) {
    return null;
  }

  try {
    const content = readFileSync(changelogPath, 'utf-8');
    const normalizedTarget = normalizeVersion(version);

    // Split by version headers (## [version] or ## version)
    const lines = content.split('\n');
    let inTargetVersion = false;
    const result: string[] = [];
    let foundVersion = false;

    for (const line of lines) {
      // Check if this is a version header
      if (line.startsWith('## ')) {
        // Extract version from header (e.g., "## [1.1.1]" or "## 1.0.0")
        const versionMatch = line.match(/^##\s+(?:\[)?([^\]]+)(?:\])?/);
        if (versionMatch) {
          const headerVersion = normalizeVersion(versionMatch[1]);

          if (inTargetVersion) {
            // We've reached the next version, stop collecting
            break;
          }

          if (headerVersion === normalizedTarget) {
            // Found our target version
            inTargetVersion = true;
            foundVersion = true;
            // Include the header line
            result.push(line);
            continue;
          }
        }
      }

      // Collect lines if we're in the target version section
      if (inTargetVersion) {
        result.push(line);
      }
    }

    if (!foundVersion) {
      return null;
    }

    // Clean up the result - remove leading/trailing empty lines
    while (result.length > 0 && result[0].trim() === '') {
      result.shift();
    }
    while (result.length > 0 && result[result.length - 1].trim() === '') {
      result.pop();
    }

    return result.length > 0 ? result.join('\n') : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Format changelog entry for display in the UI.
 * Removes markdown links and formats for terminal display.
 *
 * @param changelog - Raw changelog text
 * @returns Formatted changelog text
 */
export function formatChangelogForDisplay(changelog: string): string {
  return changelog
    .split('\n')
    .map((line) => {
      // Remove markdown links: [text](url) -> text
      return line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    })
    .join('\n');
}
