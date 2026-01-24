import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

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
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns parsed frontmatter and remaining content.
 */
function parseYamlFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const yamlRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(yamlRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  // Simple YAML parser for basic key-value pairs
  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if (typeof value === 'string') {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
    }

    // Handle arrays (simple format: - item1, - item2)
    if (trimmed.includes('-')) {
      const arrayMatch = trimmed.match(/^-\s*(.+)$/);
      if (arrayMatch) {
        const arrayKey = key || 'items';
        if (!frontmatter[arrayKey] || !Array.isArray(frontmatter[arrayKey])) {
          frontmatter[arrayKey] = [];
        }
        (frontmatter[arrayKey] as unknown[]).push(arrayMatch[1].trim().replace(/^["']|["']$/g, ''));
        continue;
      }
    }

    // Handle nested arrays (dependencies: - item1)
    if (key && value && typeof value === 'string' && value.startsWith('-')) {
      const arrayKey = key;
      if (!frontmatter[arrayKey] || !Array.isArray(frontmatter[arrayKey])) {
        frontmatter[arrayKey] = [];
      }
      (frontmatter[arrayKey] as unknown[]).push(
        value
          .slice(1)
          .trim()
          .replace(/^["']|["']$/g, '')
      );
      continue;
    }

    if (key) {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
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
export async function indexDocument(db: DatabaseType, filePath: string): Promise<DocumentMetadata> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
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
 * Recursively find all files with specified extensions in a directory.
 *
 * @param dir - Directory to search
 * @param extensions - File extensions to match (e.g., ['.md', '.jsx', '.tsx'])
 * @param ignorePatterns - Patterns to ignore
 * @returns Array of file paths
 */
function findFiles(
  dir: string,
  extensions: string[] = ['.md'],
  ignorePatterns: string[] = []
): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Check ignore patterns
    const shouldIgnore = ignorePatterns.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(fullPath) || regex.test(entry.name);
      }
      return fullPath.includes(pattern) || entry.name.includes(pattern);
    });

    if (shouldIgnore) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...findFiles(fullPath, extensions, ignorePatterns));
    } else if (entry.isFile()) {
      // Check if file matches any of the extensions
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
  ignorePatterns: string[] = ['.git', 'node_modules', '.tmp']
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
 * @returns Combined indexing result
 */
export async function indexAllPaths(
  db: DatabaseType,
  paths: string[],
  extensions: string[] = ['.md'],
  ignorePatterns: string[] = ['.git', 'node_modules', '.tmp']
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

    const files = findFiles(path, extensions, ignorePatterns);
    for (const file of files) {
      // Deduplicate files (in case paths overlap)
      if (!seenFiles.has(file)) {
        seenFiles.add(file);
        allFiles.push(file);
      }
    }
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
        await indexDocument(db, filePath);

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
