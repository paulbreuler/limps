import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { FrontmatterHandler } from './utils/frontmatter.js';
import { PathFilter } from './utils/pathfilter.js';
import { isExcludedDirectory, shouldExcludeFile } from './utils/pathfilter.js';
import { checkPathSafety, isSymlink } from './utils/fs-safety.js';
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_FILE_SIZE, DEFAULT_EXCLUSIONS } from './config.js';
import type { ExclusionsConfig, PathConfig } from './config.js';
import { streamingScan, type ScanProgress } from './scanner.js';

/**
 * Document metadata interface.
 */
export interface DocumentMetadata {
  path: string;
  title: string;
  content: string;
  summary?: string;
  status?: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED' | 'MISSING';
  dependencies?: string[];
  modifiedAt: number;
  hash: string;
}

/**
 * File presence metadata (recorded without parsing content).
 */
export interface FilePresence {
  path: string;
  size: number;
  mtime: number;
  type: string;
  indexedAt: number;
}

/**
 * Result of a presence-only indexing operation.
 */
export interface PresenceIndexingResult {
  recorded: number;
  skipped: number;
}

/**
 * Indexing result interface for batch operations.
 */
export interface IndexingResult {
  indexed: number;
  updated: number;
  skipped: number;
  errors: { path: string; error: string }[];
}

/**
 * Initialize a SQLite database at the given path.
 * Creates the database file if it doesn't exist.
 *
 * @param dbPath - Path to the SQLite database file
 * @returns Database instance
 */
export function initializeDatabase(dbPath: string): DatabaseType {
  const db = new Database(dbPath);
  return db;
}

/**
 * Create the database schema including documents table and FTS5 virtual table.
 * Must be called after initializeDatabase.
 *
 * @param db - Database instance
 */
export function createSchema(db: DatabaseType): void {
  // Create documents table first (required for FTS5 foreign key constraint)
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      modified_at INTEGER NOT NULL,
      hash TEXT NOT NULL
    )
  `);

  // Create FTS5 virtual table for full-text search
  // FTS5 has its own internal rowid - we store path as a searchable column
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      path,
      title,
      content
    )
  `);

  // Create file_presence table for presence-only indexing
  // Records that files exist (path, size, mtime) without parsing content
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_presence (
      path TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'file',
      indexed_at INTEGER NOT NULL
    )
  `);
}

/**
 * Clear all indexed documents.
 *
 * @param db - Database instance
 */
export function clearIndex(db: DatabaseType): void {
  db.exec(`
    DELETE FROM documents_fts;
    DELETE FROM documents;
    DELETE FROM file_presence;
  `);
}

// Create a singleton FrontmatterHandler instance
const frontmatterHandler = new FrontmatterHandler();

/**
 * Parse YAML frontmatter from markdown content.
 * Returns parsed frontmatter and remaining content.
 * Uses FrontmatterHandler for robust parsing (supports Obsidian properties).
 */
function parseYamlFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  try {
    const parsed = frontmatterHandler.parse(content);
    return {
      frontmatter: parsed.frontmatter,
      body: parsed.content,
    };
  } catch (error) {
    // Log error but don't fail indexing - treat as no frontmatter
    console.error(
      `Failed to parse YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`
    );
    return { frontmatter: {}, body: content };
  }
}

/**
 * Parse TOML frontmatter from markdown content.
 * Returns parsed frontmatter and remaining content.
 */
function parseTomlFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const tomlRegex = /^\+\+\+\s*\n([\s\S]*?)\n\+\+\+\s*\n([\s\S]*)$/;
  const match = content.match(tomlRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  // Simple TOML parser for basic key-value pairs
  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    let value: unknown = trimmed.slice(equalIndex + 1).trim();

    // Remove quotes if present
    if (typeof value === 'string') {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
    }

    if (key) {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * Extract title from markdown content.
 * Tries frontmatter first, then H1 heading.
 */
function extractTitle(content: string, frontmatter: Record<string, unknown>): string {
  // Try frontmatter first
  if (frontmatter.title && typeof frontmatter.title === 'string') {
    return frontmatter.title;
  }

  // Extract from first H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fallback to filename or default
  return 'Untitled Document';
}

/**
 * Extract dependencies from markdown content.
 * Looks for patterns like #1, #2, feature-1, etc.
 */
function extractDependencies(content: string, frontmatter: Record<string, unknown>): string[] {
  const deps: string[] = [];

  // Check frontmatter
  if (frontmatter.dependencies) {
    if (Array.isArray(frontmatter.dependencies)) {
      deps.push(...frontmatter.dependencies.map((d) => String(d)));
    } else if (typeof frontmatter.dependencies === 'string') {
      deps.push(frontmatter.dependencies);
    }
  }

  // Extract from content: #1, #2, feature-1, etc.
  const featureRefRegex = /#(\d+)|feature[_-]?(\d+)|depends[_\s]+on[:\s]+([#\w\s,]+)/gi;
  const matches = content.matchAll(featureRefRegex);

  for (const match of matches) {
    if (match[1]) {
      deps.push(`#${match[1]}`);
    } else if (match[2]) {
      deps.push(`feature-${match[2]}`);
    } else if (match[3]) {
      const refs = match[3].split(/[,\s]+/).filter((r) => r.trim());
      deps.push(...refs.map((r) => r.trim()));
    }
  }

  // Remove duplicates
  return Array.from(new Set(deps));
}

/**
 * Calculate MD5 hash of content.
 */
function calculateHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Index a single document into the database.
 *
 * @param db - Database instance
 * @param filePath - Path to the markdown file
 * @returns Document metadata
 */
export async function indexDocument(
  db: DatabaseType,
  filePath: string,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE
): Promise<DocumentMetadata> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Safety check: reject symlinks and oversized files before reading content
  const safety = checkPathSafety(filePath, { maxFileSize });
  if (!safety.safe) {
    throw new Error(`Skipping unsafe file ${filePath}: ${safety.reason}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const stats = statSync(filePath);
  const modifiedAt = stats.mtimeMs;
  const hash = calculateHash(content);

  // Parse frontmatter (try YAML first, then TOML)
  let frontmatter: Record<string, unknown> = {};
  let body = content;

  const yamlResult = parseYamlFrontmatter(content);
  if (yamlResult.frontmatter && Object.keys(yamlResult.frontmatter).length > 0) {
    frontmatter = yamlResult.frontmatter;
    body = yamlResult.body;
  } else {
    const tomlResult = parseTomlFrontmatter(content);
    if (tomlResult.frontmatter && Object.keys(tomlResult.frontmatter).length > 0) {
      frontmatter = tomlResult.frontmatter;
      body = tomlResult.body;
    }
  }

  // Extract metadata
  const title = extractTitle(body, frontmatter);
  const dependencies = extractDependencies(content, frontmatter);
  const status = frontmatter.status as 'GAP' | 'WIP' | 'PASS' | 'BLOCKED' | 'MISSING' | undefined;

  const metadata: DocumentMetadata = {
    path: filePath,
    title,
    content,
    status,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    modifiedAt,
    hash,
  };

  // Check if document already exists
  const existing = db.prepare('SELECT hash FROM documents WHERE path = ?').get(filePath) as
    | {
        hash: string;
      }
    | undefined;

  if (existing && existing.hash === hash) {
    // No change, return existing metadata
    return metadata;
  }

  // Update or insert document
  await updateDocumentIndex(db, metadata);

  return metadata;
}

/**
 * Update document index in database and FTS5.
 *
 * @param db - Database instance
 * @param metadata - Document metadata
 */
export async function updateDocumentIndex(
  db: DatabaseType,
  metadata: DocumentMetadata
): Promise<void> {
  const transaction = db.transaction(() => {
    // Check if document exists
    const existing = db.prepare('SELECT path FROM documents WHERE path = ?').get(metadata.path);

    // Insert or replace in documents table
    db.prepare(
      `
      INSERT OR REPLACE INTO documents (path, title, content, modified_at, hash)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(
      metadata.path,
      metadata.title,
      metadata.content,
      Math.floor(metadata.modifiedAt),
      metadata.hash
    );

    // For FTS5, delete first if exists, then insert (INSERT OR REPLACE doesn't work well with FTS5)
    if (existing) {
      db.prepare('DELETE FROM documents_fts WHERE path = ?').run(metadata.path);
    }

    // Insert into FTS5 index
    db.prepare(
      `
      INSERT INTO documents_fts (path, title, content)
      VALUES (?, ?, ?)
    `
    ).run(metadata.path, metadata.title, metadata.content);
  });

  transaction();
}

/**
 * Remove document from database and FTS5 index.
 *
 * @param db - Database instance
 * @param filePath - Path to the document
 */
export async function removeDocument(db: DatabaseType, filePath: string): Promise<void> {
  const transaction = db.transaction(() => {
    // Remove from documents table
    db.prepare('DELETE FROM documents WHERE path = ?').run(filePath);

    // Remove from FTS5 index
    db.prepare('DELETE FROM documents_fts WHERE path = ?').run(filePath);
  });

  transaction();
}

/**
 * Remove indexed documents for a path and all nested descendants.
 *
 * @param db - Database instance
 * @param pathPrefix - Absolute path to file/directory root
 */
export async function removeDocumentsByPathPrefix(
  db: DatabaseType,
  pathPrefix: string
): Promise<void> {
  const escapedPrefix = pathPrefix.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const nestedLikePattern = `${escapedPrefix}/%`;
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM documents WHERE path = ? OR path LIKE ? ESCAPE '\\'").run(
      pathPrefix,
      nestedLikePattern
    );
    db.prepare("DELETE FROM documents_fts WHERE path = ? OR path LIKE ? ESCAPE '\\'").run(
      pathPrefix,
      nestedLikePattern
    );
  });

  transaction();
}

/**
 * Recursively find all files with specified extensions in a directory.
 * Uses PathFilter for consistent filtering. Rejects symlinks and enforces depth limits.
 *
 * @param dir - Directory to search
 * @param extensions - File extensions to match (e.g., ['.md', '.jsx', '.tsx'])
 * @param ignorePatterns - Patterns to ignore (legacy support, PathFilter handles this)
 * @param baseDir - Base directory for relative path calculation (internal use)
 * @param maxDepth - Maximum recursion depth (default: DEFAULT_MAX_DEPTH)
 * @param currentDepth - Current recursion depth (internal use)
 * @returns Array of file paths
 */
function findFiles(
  dir: string,
  extensions: string[] = ['.md'],
  ignorePatterns: string[] = [],
  baseDir?: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  currentDepth = 0
): string[] {
  if (currentDepth > maxDepth) {
    return [];
  }

  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const searchBase = baseDir || dir;

  // Create PathFilter with custom ignored patterns and allowed extensions
  const pathFilter = new PathFilter({
    ignoredPatterns: ignorePatterns.map((pattern) => {
      // Convert simple patterns to glob patterns for PathFilter
      if (pattern.includes('*')) {
        return pattern;
      }
      return `**/${pattern}/**`;
    }),
    allowedExtensions: extensions,
  });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Skip symlinks unconditionally — prevents data leaks from outside the plans tree
    if (isSymlink(fullPath)) {
      continue;
    }

    // Get relative path from the search root for PathFilter
    const relativePath = relative(searchBase, fullPath).replace(/\\/g, '/');

    // Use PathFilter to check if path is allowed
    if (!pathFilter.isAllowed(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(
        ...findFiles(fullPath, extensions, ignorePatterns, searchBase, maxDepth, currentDepth + 1)
      );
    } else if (entry.isFile()) {
      // PathFilter already checked extension, but double-check for safety
      const matchesExtension = extensions.some((ext) => entry.name.endsWith(ext));
      if (matchesExtension) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Legacy function name for backward compatibility.
 * @deprecated Use findFiles instead
 */
function findMarkdownFiles(dir: string, ignorePatterns: string[] = []): string[] {
  return findFiles(dir, ['.md'], ignorePatterns);
}

/**
 * Index all documents in a directory.
 *
 * @param db - Database instance
 * @param plansPath - Path to the plans directory
 * @param ignorePatterns - Patterns to ignore (e.g., ['node_modules', '.git'])
 * @returns Indexing result
 */
export async function indexAllDocuments(
  db: DatabaseType,
  plansPath: string,
  ignorePatterns: string[] = ['.git', 'node_modules', '.tmp', '.obsidian']
): Promise<IndexingResult> {
  if (!existsSync(plansPath)) {
    throw new Error(`Directory not found: ${plansPath}`);
  }

  const result: IndexingResult = {
    indexed: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const files = findMarkdownFiles(plansPath, ignorePatterns);

  // Process files with limited concurrency
  const concurrency = 10;
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const promises = batch.map(async (filePath) => {
      try {
        // Check if file exists and get current hash
        if (!existsSync(filePath)) {
          result.errors.push({ path: filePath, error: 'File not found' });
          return;
        }

        const content = readFileSync(filePath, 'utf-8');
        const hash = calculateHash(content);

        // Check existing hash in database
        const existing = db.prepare('SELECT hash FROM documents WHERE path = ?').get(filePath) as
          | {
              hash: string;
            }
          | undefined;

        if (existing && existing.hash === hash) {
          result.skipped++;
          return;
        }

        // Determine if this is an update or new index before indexing
        const wasExisting = existing !== undefined;

        // Index the document
        await indexDocument(db, filePath);

        // Count based on whether it existed before
        if (wasExisting) {
          result.updated++;
        } else {
          result.indexed++;
        }
      } catch (error) {
        result.errors.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(promises);
  }

  return result;
}

/**
 * Index all documents from multiple paths with configurable file extensions.
 *
 * @param db - Database instance
 * @param paths - Array of paths to index
 * @param extensions - File extensions to index (e.g., ['.md', '.jsx', '.tsx'])
 * @param ignorePatterns - Patterns to ignore (e.g., ['node_modules', '.git'])
 * @param maxDepth - Maximum directory recursion depth
 * @param maxFileSize - Maximum file size in bytes to index
 * @returns Combined indexing result
 */
export async function indexAllPaths(
  db: DatabaseType,
  paths: string[],
  extensions: string[] = ['.md'],
  ignorePatterns: string[] = ['.git', 'node_modules', '.tmp', '.obsidian'],
  maxDepth: number = DEFAULT_MAX_DEPTH,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE
): Promise<IndexingResult> {
  const result: IndexingResult = {
    indexed: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  // Collect all files from all paths
  const allFiles: string[] = [];
  const seenFiles = new Set<string>();

  for (const path of paths) {
    if (!existsSync(path)) {
      result.errors.push({ path, error: `Directory not found: ${path}` });
      continue;
    }

    const files = findFiles(path, extensions, ignorePatterns, undefined, maxDepth);
    for (const file of files) {
      // Deduplicate files (in case paths overlap)
      if (!seenFiles.has(file)) {
        seenFiles.add(file);
        allFiles.push(file);
      }
    }
  }

  // Warn if indexing suspiciously large number of files or root-like paths
  const hasRootPath = paths.some((p) => p === '.' || p === './' || p === '/' || p.endsWith('/.'));
  const isSuspiciousCount = allFiles.length > 200 || (hasRootPath && allFiles.length > 50);
  if (isSuspiciousCount) {
    console.error(`⚠️  Warning: About to index ${allFiles.length} files`);
    console.error(`   This may take a while on first startup`);
    console.error(`   Paths being indexed: ${paths.join(', ')}`);
    console.error(`   If this wasn't intentional, check your configuration`);
  }

  // Process files with limited concurrency
  const concurrency = 10;
  for (let i = 0; i < allFiles.length; i += concurrency) {
    const batch = allFiles.slice(i, i + concurrency);
    const promises = batch.map(async (filePath) => {
      try {
        if (!existsSync(filePath)) {
          result.errors.push({ path: filePath, error: 'File not found' });
          return;
        }

        // Safety check: skip symlinks and oversized files
        const safety = checkPathSafety(filePath, { maxFileSize });
        if (!safety.safe) {
          result.skipped++;
          return;
        }

        const content = readFileSync(filePath, 'utf-8');
        const hash = calculateHash(content);

        const existing = db.prepare('SELECT hash FROM documents WHERE path = ?').get(filePath) as
          | {
              hash: string;
            }
          | undefined;

        if (existing && existing.hash === hash) {
          result.skipped++;
          return;
        }

        const wasExisting = existing !== undefined;
        await indexDocument(db, filePath, maxFileSize);

        if (wasExisting) {
          result.updated++;
        } else {
          result.indexed++;
        }
      } catch (error) {
        result.errors.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(promises);
  }

  return result;
}

/**
 * Recursively collect all file paths from a directory for presence indexing.
 * Respects exclusions for directories, file patterns, and binary extensions.
 *
 * @param dir - Directory to scan
 * @param exclusions - Exclusions configuration
 * @param maxDepth - Maximum recursion depth
 * @param currentDepth - Current recursion depth (internal)
 * @returns Array of { path, size, mtime } entries
 */
function collectPresenceFiles(
  dir: string,
  exclusions?: ExclusionsConfig,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  currentDepth = 0
): { path: string; size: number; mtime: number }[] {
  if (currentDepth > maxDepth) {
    return [];
  }

  const results: { path: string; size: number; mtime: number }[] = [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Skip symlinks
    if (isSymlink(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (isExcludedDirectory(entry.name, exclusions)) {
        continue;
      }
      results.push(...collectPresenceFiles(fullPath, exclusions, maxDepth, currentDepth + 1));
    } else if (entry.isFile()) {
      try {
        const stats = statSync(fullPath);
        if (shouldExcludeFile(fullPath, stats.size, exclusions)) {
          continue;
        }
        results.push({
          path: fullPath,
          size: stats.size,
          mtime: Math.floor(stats.mtimeMs),
        });
      } catch {
        // Skip files we can't stat
      }
    }
  }

  return results;
}

/**
 * Index files in presence-only mode.
 * Records path/size/mtime in file_presence table without parsing content.
 * Uses batched inserts (100 per transaction) for performance.
 *
 * @param db - Database instance
 * @param dirPath - Directory path to scan
 * @param exclusions - Optional exclusions configuration
 * @param maxDepth - Maximum recursion depth
 * @returns Presence indexing result
 */
export function indexPresence(
  db: DatabaseType,
  dirPath: string,
  exclusions?: ExclusionsConfig,
  maxDepth: number = DEFAULT_MAX_DEPTH
): PresenceIndexingResult {
  if (!existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const files = collectPresenceFiles(dirPath, exclusions, maxDepth);
  const now = Date.now();
  const BATCH_SIZE = 100;

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO file_presence (path, size, mtime, type, indexed_at)
    VALUES (?, ?, ?, 'file', ?)
  `);

  let recorded = 0;
  let skipped = 0;

  const checkStmt = db.prepare('SELECT size, mtime FROM file_presence WHERE path = ?');

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const transaction = db.transaction(() => {
      for (const file of batch) {
        const existing = checkStmt.get(file.path) as { size: number; mtime: number } | undefined;

        if (existing && existing.size === file.size && existing.mtime === file.mtime) {
          skipped++;
          continue;
        }

        insertStmt.run(file.path, file.size, file.mtime, now);
        recorded++;
      }
    });
    transaction();
  }

  return { recorded, skipped };
}

/**
 * Get file presence record for a specific path.
 *
 * @param db - Database instance
 * @param path - File path to look up
 * @returns FilePresence record or undefined
 */
export function getFilePresence(db: DatabaseType, path: string): FilePresence | undefined {
  const row = db
    .prepare('SELECT path, size, mtime, type, indexed_at FROM file_presence WHERE path = ?')
    .get(path) as
    | { path: string; size: number; mtime: number; type: string; indexed_at: number }
    | undefined;

  if (!row) {
    return undefined;
  }

  return {
    path: row.path,
    size: row.size,
    mtime: row.mtime,
    type: row.type,
    indexedAt: row.indexed_at,
  };
}

/**
 * Search file presence records by path pattern (SQL LIKE).
 *
 * @param db - Database instance
 * @param pattern - SQL LIKE pattern (e.g., '%.md' or '%/src/%')
 * @returns Array of matching FilePresence records
 */
export function searchFilePresence(db: DatabaseType, pattern: string): FilePresence[] {
  const rows = db
    .prepare('SELECT path, size, mtime, type, indexed_at FROM file_presence WHERE path LIKE ?')
    .all(pattern) as {
    path: string;
    size: number;
    mtime: number;
    type: string;
    indexed_at: number;
  }[];

  return rows.map((row) => ({
    path: row.path,
    size: row.size,
    mtime: row.mtime,
    type: row.type,
    indexedAt: row.indexed_at,
  }));
}

/**
 * Record a single file's presence in the file_presence table.
 */
function recordPresenceEntry(
  db: DatabaseType,
  filePath: string,
  size: number,
  mtime: number
): void {
  const dotIndex = filePath.lastIndexOf('.');
  const ext = dotIndex !== -1 ? filePath.slice(dotIndex) : 'file';
  db.prepare(
    `INSERT OR REPLACE INTO file_presence (path, size, mtime, type, indexed_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(filePath, size, Math.floor(mtime), ext, Date.now());
}

/**
 * Index documents from multi-path config using the streaming scanner.
 * Supports both 'full' (FTS) and 'presence' (metadata-only) index modes.
 *
 * @param db - Database instance
 * @param pathConfigs - Array of PathConfig entries
 * @param exclusions - Global exclusions config
 * @param globalExtensions - Default file extensions
 * @param globalMaxDepth - Default max directory depth
 * @param globalMaxFileSize - Default max file size
 * @param onProgress - Optional progress callback
 * @returns Combined indexing result
 */
export async function indexAllPathsStreaming(
  db: DatabaseType,
  pathConfigs: PathConfig[],
  exclusions: ExclusionsConfig = DEFAULT_EXCLUSIONS,
  globalExtensions: string[] = ['.md'],
  globalMaxDepth: number = DEFAULT_MAX_DEPTH,
  globalMaxFileSize: number = DEFAULT_MAX_FILE_SIZE,
  onProgress?: (progress: ScanProgress) => void
): Promise<IndexingResult> {
  const result: IndexingResult = {
    indexed: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const scanner = streamingScan(
    pathConfigs,
    exclusions,
    globalExtensions,
    globalMaxDepth,
    globalMaxFileSize,
    onProgress
  );

  for await (const entry of scanner) {
    try {
      if (entry.indexMode === 'presence') {
        recordPresenceEntry(db, entry.path, entry.stat.size, entry.stat.mtime);
        result.indexed++;
        continue;
      }

      // Full indexing mode
      if (!existsSync(entry.path)) {
        result.errors.push({ path: entry.path, error: 'File not found' });
        continue;
      }

      const content = readFileSync(entry.path, 'utf-8');
      const hash = calculateHash(content);

      const existing = db.prepare('SELECT hash FROM documents WHERE path = ?').get(entry.path) as
        | { hash: string }
        | undefined;

      if (existing && existing.hash === hash) {
        result.skipped++;
        continue;
      }

      const wasExisting = existing !== undefined;
      await indexDocument(db, entry.path, globalMaxFileSize);

      if (wasExisting) {
        result.updated++;
      } else {
        result.indexed++;
      }
    } catch (error) {
      result.errors.push({
        path: entry.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

// Re-export scanner types for consumers
export type { ScanProgress };
