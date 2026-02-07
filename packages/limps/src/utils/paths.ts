/**
 * Path validation utilities for MCP document CRUD operations.
 * Validates paths, prevents directory traversal, and enforces access restrictions.
 */

import { resolve, dirname, basename, extname, isAbsolute, relative, join } from 'path';
import { existsSync } from 'fs';
import { restrictedPath, validationError } from './errors.js';
import { PathFilter } from './pathfilter.js';

/**
 * Document type based on file extension.
 */
export type DocType = 'md' | 'jsx' | 'tsx' | 'ts' | 'json' | 'yaml' | 'other';

/**
 * Result of path validation.
 */
export interface ValidatedPath {
  /** Path relative to repo root */
  relative: string;
  /** Absolute path */
  absolute: string;
  /** Document type based on extension */
  type: DocType;
  /** Directory portion (empty string for root) */
  directory: string;
  /** Filename with extension */
  filename: string;
  /** File extension including dot (e.g., '.md') */
  extension: string;
}

/**
 * Options for path validation.
 */
export interface PathValidationOptions {
  /** Whether to check if path is in a writable directory (default: false) */
  requireWritable?: boolean;
}

/**
 * Paths that are restricted and cannot be accessed.
 */
export const RESTRICTED_PATHS: readonly string[] = [
  '.git',
  'node_modules',
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
];

/**
 * Directories that allow write operations.
 */
export const WRITABLE_DIRS: readonly string[] = ['addendums', 'examples', 'research', 'plans'];

/**
 * Plan files that require confirmation before overwrite (protected, not blocked).
 * These files can be written, but require explicit confirmation (force: true).
 * Supports both legacy (plan.md) and new ({dirName}-plan.md) formats.
 */
export const PROTECTED_PLAN_FILES: readonly RegExp[] = [
  /^plans\/\d{4}-[^/]+\/plan\.md$/, // Legacy: plan.md
  /^plans\/(\d{4}-[^/]+)\/\1-plan\.md$/, // New: {dirName}-plan.md
];

/**
 * Reject path traversal in codebasePath (e.g. "../" or "..\\").
 * codebasePath is otherwise trusted; this only blocks relative traversal.
 */
export function isSafeCodebasePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return !normalized.split('/').includes('..');
}

/**
 * Get the plan file name for a plan directory (new format).
 * Format: {dirName}-plan.md (e.g., "0001-feature-name-plan.md")
 *
 * @param dirName - Plan directory name (e.g., "0001-feature-name")
 * @returns Plan file name
 */
export function getPlanFileName(dirName: string): string {
  return `${dirName}-plan.md`;
}

/**
 * Find the plan file in a plan directory.
 * Supports both new format ({dirName}-plan.md) and legacy format (plan.md).
 *
 * @param planDir - Absolute path to the plan directory
 * @returns Absolute path to the plan file, or null if not found
 */
export function findPlanFile(planDir: string): string | null {
  const dirName = basename(planDir);

  // Try new format first: {dirName}-plan.md
  const newFormat = join(planDir, `${dirName}-plan.md`);
  if (existsSync(newFormat)) {
    return newFormat;
  }

  // Fall back to legacy format: plan.md
  const legacyFormat = join(planDir, 'plan.md');
  if (existsSync(legacyFormat)) {
    return legacyFormat;
  }

  return null;
}

/**
 * Check if a path is a protected plan file that requires confirmation.
 *
 * @param relativePath - Path relative to repo root
 * @returns True if the path matches a protected plan file pattern
 */
export function isProtectedPlanFile(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);
  return PROTECTED_PLAN_FILES.some((pattern) => pattern.test(normalized));
}

/**
 * Get document type from file path based on extension.
 */
export function getDocType(filePath: string): DocType {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.md':
      return 'md';
    case '.jsx':
      return 'jsx';
    case '.tsx':
      return 'tsx';
    case '.ts':
      return 'ts';
    case '.json':
      return 'json';
    case '.yaml':
    case '.yml':
      return 'yaml';
    default:
      return 'other';
  }
}

/**
 * Check if a path is writable (in allowed directories or root .md file).
 */
export function isWritablePath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);

  // Empty path (root) is not writable
  if (!normalized) {
    return false;
  }

  // Get the top-level directory
  const parts = normalized.split('/');
  const topDir = parts[0];

  // Check if in writable directories
  if (WRITABLE_DIRS.includes(topDir)) {
    return true;
  }

  // Root-level markdown files are writable
  if (parts.length === 1 && extname(normalized).toLowerCase() === '.md') {
    return true;
  }

  return false;
}

/**
 * Normalize a path: remove trailing slashes, collapse double slashes.
 */
function normalizePath(path: string): string {
  // Remove trailing slashes
  let normalized = path.replace(/\/+$/, '');
  // Collapse double slashes
  normalized = normalized.replace(/\/+/g, '/');
  // Remove leading ./
  normalized = normalized.replace(/^\.\//, '');
  return normalized;
}

// Create PathFilter instance for path validation
const pathFilter = new PathFilter({
  ignoredPatterns: [
    '.obsidian/**',
    '.git/**',
    'node_modules/**',
    '.DS_Store',
    'Thumbs.db',
    ...RESTRICTED_PATHS.map((p) => `**/${p}/**`),
  ],
  allowedExtensions: ['.md', '.markdown', '.txt', '.jsx', '.tsx', '.ts', '.json', '.yaml', '.yml'],
});

/**
 * Check if path matches any restricted patterns.
 * Uses PathFilter for consistent filtering.
 */
function isRestrictedPath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);

  // Use PathFilter to check if path is allowed
  if (!pathFilter.isAllowed(normalized)) {
    return true;
  }

  // Also check legacy restricted paths for backward compatibility
  const parts = normalized.split('/');
  for (const part of parts) {
    // Check exact matches
    if (RESTRICTED_PATHS.includes(part)) {
      return true;
    }
    // Check .env* patterns
    if (part.startsWith('.env')) {
      return true;
    }
  }

  return false;
}

/**
 * Validate a path relative to the repository root.
 *
 * @param path - Path to validate (relative to repo root)
 * @param repoRoot - Absolute path to repository root
 * @param options - Validation options
 * @returns Validated path information
 * @throws DocumentError if validation fails
 */
export function validatePath(
  path: string,
  repoRoot: string,
  options: PathValidationOptions = {}
): ValidatedPath {
  // Reject absolute paths
  if (isAbsolute(path)) {
    throw validationError('path', 'Path must be relative to repo root');
  }

  // Check for path traversal attempts before resolving
  if (path.includes('..')) {
    throw validationError('path', 'Path traversal not allowed');
  }

  // Reject URL-encoded characters (prevents %2e%2e traversal bypasses and null bytes)
  if (/%[0-9a-fA-F]{2}/.test(path)) {
    throw validationError('path', 'URL-encoded characters not allowed');
  }

  // Reject shell/HTML-dangerous characters
  if (/[<>|"']/.test(path)) {
    throw validationError('path', 'Path contains disallowed characters');
  }

  // Normalize the path
  const normalized = normalizePath(path);

  // Resolve to absolute path
  const absolutePath = resolve(repoRoot, normalized);

  // Double-check the resolved path is within repo root
  // This catches edge cases the simple .. check might miss
  const resolvedRelative = relative(repoRoot, absolutePath);
  if (resolvedRelative.startsWith('..') || isAbsolute(resolvedRelative)) {
    throw validationError('path', 'Path traversal not allowed');
  }

  // Check for restricted paths
  if (isRestrictedPath(normalized)) {
    throw restrictedPath(path);
  }

  // Check writable requirement
  if (options.requireWritable && !isWritablePath(normalized)) {
    throw restrictedPath(path);
  }

  // Extract path components
  const dir = dirname(normalized);
  const filename = basename(normalized);
  const extension = extname(normalized);
  const type = getDocType(normalized);

  return {
    relative: normalized,
    absolute: absolutePath,
    type,
    directory: dir === '.' ? '' : dir,
    filename: filename || normalized, // Handle directory-only paths
    extension,
  };
}
