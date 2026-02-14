/**
 * Path filtering utilities with glob pattern matching.
 * Based on patterns from mcp-obsidian for safe path filtering.
 */

import { basename, extname } from 'path';
import type { ExclusionsConfig } from '../config.js';
import { DEFAULT_EXCLUSIONS } from '../config.js';

/**
 * Configuration for PathFilter.
 */
export interface PathFilterConfig {
  /** Patterns to ignore (glob patterns like '.obsidian/**', 'node_modules/**') */
  ignoredPatterns?: string[];
  /** Allowed file extensions (e.g., ['.md', '.markdown', '.txt']) */
  allowedExtensions?: string[];
}

/**
 * Path filter with glob pattern matching.
 * Filters out system files, hidden directories, and restricts to allowed extensions.
 */
export class PathFilter {
  private ignoredPatterns: string[];
  private allowedExtensions: string[];

  constructor(config?: PathFilterConfig) {
    this.ignoredPatterns = [
      '.obsidian/**',
      '.git/**',
      'node_modules/**',
      '.DS_Store',
      'Thumbs.db',
      ...(config?.ignoredPatterns || []),
    ];

    this.allowedExtensions = ['.md', '.markdown', '.txt', ...(config?.allowedExtensions || [])];
  }

  /**
   * Simple glob pattern matching.
   * Converts glob patterns to regex for matching.
   *
   * @param pattern - Glob pattern (e.g., "STAR_STAR/*.md", ".obsidian/STAR_STAR")
   * @param path - Path to test
   * @returns true if path matches pattern
   */
  private simpleGlobMatch(pattern: string, path: string): boolean {
    // Normalize pattern path separators (Windows compatibility)
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Convert glob pattern to regex, escaping special regex chars first
    let regexPattern = normalizedPattern
      .replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') // Escape all regex special chars
      .replace(/\\\*\\\*/g, '.*') // ** matches any number of directories (unescape)
      .replace(/\\\*/g, '[^/]*') // * matches anything except / (unescape)
      .replace(/\\\?/g, '[^/]'); // ? matches single character except / (unescape)

    // Ensure we match the full path
    regexPattern = '^' + regexPattern + '$';

    const regex = new RegExp(regexPattern);
    return regex.test(path);
  }

  /**
   * Check if a path is allowed (not filtered out).
   *
   * @param path - Path to check (relative to vault root)
   * @returns true if path is allowed
   */
  isAllowed(path: string): boolean {
    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');

    // Check if path matches any ignored pattern
    for (const pattern of this.ignoredPatterns) {
      if (this.simpleGlobMatch(pattern, normalizedPath)) {
        return false;
      }
    }

    // For files, check extension if allowedExtensions is configured
    if (this.allowedExtensions.length > 0 && this.isFile(normalizedPath)) {
      const hasAllowedExtension = this.allowedExtensions.some((ext) =>
        normalizedPath.toLowerCase().endsWith(ext.toLowerCase())
      );
      if (!hasAllowedExtension) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a path is a file (has a file extension).
   *
   * @param path - Path to check
   * @returns true if path appears to be a file
   */
  private isFile(path: string): boolean {
    // A path is a file if it has a file extension at the end
    // Paths ending with '/' are always directories
    if (path.endsWith('/')) {
      return false;
    }

    // Get the last component of the path
    const lastSlashIndex = path.lastIndexOf('/');
    const lastComponent = lastSlashIndex === -1 ? path : path.substring(lastSlashIndex + 1);

    // Check if the last component has a file extension
    // A file extension is a dot followed by 1-10 alphanumeric characters at the end
    // This distinguishes "file.md" (file) from "1. Project" (directory with dot in name)
    const lastDotIndex = lastComponent.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      // No dot, or dot at the start (like .gitignore) - treat as no extension
      return false;
    }

    const extension = lastComponent.substring(lastDotIndex + 1);
    // Extension should be 1-10 characters and contain only alphanumeric characters
    // This allows .md, .txt, .markdown but not ". Project" (space after dot)
    return extension.length >= 1 && extension.length <= 10 && /^[a-zA-Z0-9]+$/.test(extension);
  }

  /**
   * Filter an array of paths, returning only allowed paths.
   *
   * @param paths - Array of paths to filter
   * @returns Array of allowed paths
   */
  filterPaths(paths: string[]): string[] {
    return paths.filter((path) => this.isAllowed(path));
  }
}

/**
 * Check if a directory name should be excluded based on exclusions config.
 *
 * @param dirName - Directory basename to check
 * @param exclusions - Exclusions configuration (uses defaults if not provided)
 * @returns true if the directory should be excluded
 */
export function isExcludedDirectory(dirName: string, exclusions?: ExclusionsConfig): boolean {
  const dirs = exclusions?.directories ?? DEFAULT_EXCLUSIONS.directories;
  return dirs.includes(dirName);
}

/**
 * Check if a file name should be excluded based on exclusions config.
 * Checks both exact file patterns and binary extensions.
 *
 * @param fileName - File basename to check
 * @param exclusions - Exclusions configuration (uses defaults if not provided)
 * @returns true if the file should be excluded
 */
export function isExcludedFile(fileName: string, exclusions?: ExclusionsConfig): boolean {
  const patterns = exclusions?.filePatterns ?? DEFAULT_EXCLUSIONS.filePatterns;
  const binaryExts = exclusions?.binaryExtensions ?? DEFAULT_EXCLUSIONS.binaryExtensions;

  // Check exact name matches and glob patterns
  for (const pattern of patterns) {
    if (pattern.startsWith('*.')) {
      // Glob extension pattern: *.pyc matches any file ending in .pyc
      const ext = pattern.slice(1); // e.g., ".pyc"
      if (fileName.endsWith(ext)) {
        return true;
      }
    } else if (fileName === pattern) {
      return true;
    }
  }

  // Check binary extensions
  const ext = extname(fileName).toLowerCase();
  if (ext && binaryExts.includes(ext)) {
    return true;
  }

  return false;
}

/**
 * Check if a file size exceeds the maximum allowed size.
 *
 * @param size - File size in bytes
 * @param exclusions - Exclusions configuration (uses defaults if not provided)
 * @returns true if the file exceeds the maximum size
 */
export function exceedsMaxFileSize(size: number, exclusions?: ExclusionsConfig): boolean {
  const maxSize = exclusions?.maxFileSize ?? DEFAULT_EXCLUSIONS.maxFileSize;
  return size > maxSize;
}

/**
 * Check if a file should be excluded based on all exclusion criteria.
 * Combines directory, file pattern, binary extension, and size checks.
 *
 * @param filePath - Full file path to check
 * @param fileSize - File size in bytes
 * @param exclusions - Exclusions configuration
 * @returns true if the file should be excluded
 */
export function shouldExcludeFile(
  filePath: string,
  fileSize: number,
  exclusions?: ExclusionsConfig
): boolean {
  const name = basename(filePath);

  if (isExcludedFile(name, exclusions)) {
    return true;
  }

  if (exceedsMaxFileSize(fileSize, exclusions)) {
    return true;
  }

  return false;
}
