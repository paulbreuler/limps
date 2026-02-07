/**
 * Shared server initialization logic.
 * Used by both stdio (server-main.ts) and HTTP (server-http.ts) entry points.
 */

import {
  loadConfig,
  getAllDocsPaths,
  getFileExtensions,
  getMaxFileSize,
  getMaxDepth,
  DEFAULT_DEBOUNCE_DELAY,
  type ServerConfig,
} from './config.js';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { LimpsWatcher } from './watcher.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  initializeDatabase,
  createSchema,
  indexAllPaths,
  indexDocument,
  removeDocument,
} from './indexer.js';
import { startWatcher, stopWatcher, DEFAULT_SETTLE_DELAY } from './watcher.js';
import { resolveConfigPath } from './utils/config-resolver.js';
import { checkFdBudget } from './utils/fd-safety.js';

/**
 * Result of initializing the shared server resources.
 */
export interface ServerResources {
  config: ServerConfig;
  db: DatabaseType;
  watcher: LimpsWatcher | null;
}

/**
 * Initialize shared server resources: config, database, file watcher.
 * This is the common setup used by both stdio and HTTP entry points.
 *
 * @param configPathArg - Optional config path from CLI argument
 * @returns Initialized server resources
 */
export async function initServerResources(configPathArg?: string): Promise<ServerResources> {
  // Resolve config path
  const configPath = resolveConfigPath(configPathArg);

  // Load configuration
  const config = loadConfig(configPath);

  // Ensure data directory exists
  mkdirSync(config.dataPath, { recursive: true });

  // Initialize database
  const dbPath = resolve(config.dataPath, 'documents.sqlite');
  const db = initializeDatabase(dbPath);
  createSchema(db);
  console.error(`Database initialized at ${dbPath}`);

  // Get all paths and extensions to index
  const docsPaths = getAllDocsPaths(config);
  const fileExtensions = getFileExtensions(config);
  const maxFileSize = getMaxFileSize(config);
  const maxDepth = getMaxDepth(config);
  const ignorePatterns = ['.git', 'node_modules', '.tmp', '.obsidian', 'dist', 'build', '.cache'];

  // Validate paths before indexing — filter to only existing directories
  const validPaths = docsPaths.filter((p) => existsSync(p));
  if (!existsSync(config.plansPath)) {
    console.error(
      '[limps] plansPath does not exist: ' +
        config.plansPath +
        '. Document indexing will be skipped.'
    );
    console.error('[limps] To configure plansPath, add it to your limps configuration file.');
  }
  for (const p of docsPaths) {
    if (!existsSync(p) && p !== config.plansPath) {
      console.error(`[limps] docsPaths entry does not exist: ${p} (skipping)`);
    }
  }

  // Initial indexing (only valid paths)
  if (validPaths.length > 0) {
    const result = await indexAllPaths(
      db,
      validPaths,
      fileExtensions,
      ignorePatterns,
      maxDepth,
      maxFileSize
    );
    console.error(
      `Indexed ${result.indexed} documents (${result.updated} updated, ${result.skipped} skipped)`
    );
    console.error(`Paths: ${validPaths.join(', ')}`);
    console.error(`Extensions: ${fileExtensions.join(', ')}`);
    if (result.errors.length > 0) {
      console.error(`Indexing errors: ${result.errors.length}`);
      for (const err of result.errors) {
        console.error(`  - ${err.path}: ${err.error}`);
      }
    }
  } else {
    console.error('No valid paths to index.');
  }

  // Check FD budget before starting watcher
  if (validPaths.length > 0) {
    const budget = checkFdBudget(validPaths, maxDepth, ignorePatterns);
    if (!budget.safe) {
      console.error(
        `[limps] Warning: estimated ${budget.estimated} watch entries ` +
          `but FD limit is ${budget.limit}. Consider reducing watch scope or running: ulimit -n 4096`
      );
    }
  }

  // Start file watcher (only watch valid paths)
  let watcher: LimpsWatcher | null = null;
  try {
    watcher = await startWatcher(
      validPaths,
      async (path, event) => {
        if (event === 'unlink') {
          await removeDocument(db, path);
          console.error(`Removed document: ${path}`);
        } else {
          await indexDocument(db, path, maxFileSize);
          console.error(`Indexed document: ${path} (${event})`);
        }
      },
      fileExtensions,
      ignorePatterns,
      DEFAULT_DEBOUNCE_DELAY,
      DEFAULT_SETTLE_DELAY,
      undefined,
      maxDepth
    );
    console.error(`File watcher started for ${validPaths.length} path(s)`);
  } catch (watchErr) {
    console.error(
      `[limps] Warning: File watcher failed to start. The server will continue without live file watching.`,
      watchErr
    );
  }

  return { config, db, watcher };
}

/**
 * Shut down shared server resources.
 *
 * @param resources - The resources to shut down
 */
export async function shutdownServerResources(resources: ServerResources): Promise<void> {
  if (resources.watcher) {
    await stopWatcher(resources.watcher);
    console.error('File watcher stopped');
    resources.watcher = null;
  }
  if (resources.db) {
    resources.db.close();
    console.error('Database connection closed');
  }
}
