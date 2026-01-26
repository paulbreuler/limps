/**
 * Path filtering utilities with glob pattern matching.
 * Based on patterns from mcp-obsidian for safe path filtering.
 */

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
