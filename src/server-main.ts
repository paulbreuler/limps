/**
 * MCP Server startup logic.
 * Extracted from index.ts for use by CLI commands.
 */

import {
  loadConfig,
  getAllDocsPaths,
  getFileExtensions,
  DEFAULT_DEBOUNCE_DELAY,
} from './config.js';
import { createServer, startServer } from './server.js';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import type { FSWatcher } from 'chokidar';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  initializeDatabase,
  createSchema,
  indexAllPaths,
  indexDocument,
  removeDocument,
} from './indexer.js';
import { startWatcher, stopWatcher, DEFAULT_SETTLE_DELAY, type SettledChange } from './watcher.js';
import { resolveConfigPath } from './utils/config-resolver.js';
import { healAgentFrontmatter } from './utils/agent-heal.js';

// Global references for graceful shutdown
let watcher: FSWatcher | null = null;
let db: DatabaseType | null = null;

/**
 * Start the MCP Planning Server.
 *
 * @param configPathArg - Optional config path from CLI argument
 */
export async function startMcpServer(configPathArg?: string): Promise<void> {
  // Resolve config path
  const configPath = resolveConfigPath(configPathArg);

  // Load configuration
  const config = loadConfig(configPath);

  // Ensure data directory exists
  mkdirSync(config.dataPath, { recursive: true });

  // Initialize database
  const dbPath = resolve(config.dataPath, 'documents.sqlite');
  db = initializeDatabase(dbPath);
  createSchema(db);
  console.error(`Database initialized at ${dbPath}`);

  // Get all paths and extensions to index
  const docsPaths = getAllDocsPaths(config);
  const fileExtensions = getFileExtensions(config);
  const ignorePatterns = ['.git', 'node_modules', '.tmp', '.obsidian'];

  // Initial indexing
  const result = await indexAllPaths(db, docsPaths, fileExtensions, ignorePatterns);
  console.error(
    `Indexed ${result.indexed} documents (${result.updated} updated, ${result.skipped} skipped)`
  );
  console.error(`Paths: ${docsPaths.join(', ')}`);
  console.error(`Extensions: ${fileExtensions.join(', ')}`);
  if (result.errors.length > 0) {
    console.error(`Indexing errors: ${result.errors.length}`);
    for (const err of result.errors) {
      console.error(`  - ${err.path}: ${err.error}`);
    }
  }

  // Capture db reference for watcher callback
  const dbRef = db;

  // Start file watcher
  watcher = startWatcher(
    docsPaths,
    async (path, event) => {
      if (event === 'unlink') {
        await removeDocument(dbRef, path);
        console.error(`Removed document: ${path}`);
      } else {
        await indexDocument(dbRef, path);
        console.error(`Indexed document: ${path} (${event})`);
      }
    },
    fileExtensions,
    ignorePatterns,
    DEFAULT_DEBOUNCE_DELAY,
    DEFAULT_SETTLE_DELAY,
    async (changes: SettledChange[]) => {
      for (const change of changes) {
        if (change.event === 'unlink') {
          continue;
        }

        const isAgentFile = /[/\\]agents[/\\].+\.agent\.md$/i.test(change.path);
        if (isAgentFile) {
          const { changed } = healAgentFrontmatter(change.path);
          if (changed) {
            await indexDocument(dbRef, change.path);
            console.error(`Healed agent frontmatter: ${change.path}`);
          }
        }
      }
    }
  );
  console.error(`File watcher started for ${docsPaths.length} path(s)`);

  // Create and start server
  const server = createServer(config, db);
  await startServer(server, async () => {
    // Graceful shutdown callback
    if (watcher) {
      await stopWatcher(watcher);
      console.error('File watcher stopped');
      watcher = null;
    }
    if (db) {
      db.close();
      console.error('Database connection closed');
      db = null;
    }
  });
}
