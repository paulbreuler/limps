#!/usr/bin/env node
import { loadConfig, getAllDocsPaths, getFileExtensions } from './config.js';
import { createServer, startServer } from './server.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import type { FSWatcher } from 'chokidar';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  initializeDatabase,
  createSchema,
  indexAllPaths,
  indexDocument,
  removeDocument,
} from './indexer.js';
import { startWatcher, stopWatcher } from './watcher.js';
import { readCoordination } from './coordination.js';
import { getOSConfigPath } from './utils/os-paths.js';

// Global references for graceful shutdown
let watcher: FSWatcher | null = null;
let db: DatabaseType | null = null;

/**
 * Parse command line arguments.
 *
 * @returns Parsed arguments with optional configPath
 */
function parseArgs(): { configPath?: string } {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf('--config');
  if (configIndex !== -1 && args[configIndex + 1]) {
    return { configPath: args[configIndex + 1] };
  }
  return {};
}

/**
 * Resolve configuration file path with priority:
 * 1. CLI argument --config
 * 2. Environment variable MCP_PLANNING_CONFIG
 * 3. OS-specific default path
 *
 * Falls back to repo-local config.json if no config exists at determined path.
 *
 * @param cliConfigPath - Config path from CLI argument (if provided)
 * @returns Resolved absolute path to config file
 */
function resolveConfigPath(cliConfigPath?: string): string {
  // Priority 1: CLI argument
  if (cliConfigPath) {
    return resolve(cliConfigPath);
  }

  // Priority 2: Environment variable
  const envConfigPath = process.env.MCP_PLANNING_CONFIG;
  if (envConfigPath) {
    return resolve(envConfigPath);
  }

  // Priority 3: OS-specific default
  const osConfigPath = getOSConfigPath();
  if (existsSync(osConfigPath)) {
    return osConfigPath;
  }

  // Fallback: repo-local config.json (for development/backwards compatibility)
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  const srcDir = dirname(currentDir);
  const repoRoot = dirname(srcDir);
  const repoConfigPath = resolve(repoRoot, 'config.json');

  // If neither OS config nor repo config exists, use OS path (will be created)
  if (existsSync(repoConfigPath)) {
    return repoConfigPath;
  }

  return osConfigPath;
}

/**
 * Entry point for the MCP Planning Server.
 * Loads configuration and starts the server.
 */
async function main(): Promise<void> {
  try {
    // Parse CLI arguments and resolve config path
    const args = parseArgs();
    const configPath = resolveConfigPath(args.configPath);

    // Load configuration
    const config = loadConfig(configPath);

    // Ensure data directory exists
    mkdirSync(config.dataPath, { recursive: true });

    // Initialize database
    const dbPath = resolve(config.dataPath, 'documents.sqlite');
    db = initializeDatabase(dbPath);
    createSchema(db);
    console.error(`Database initialized at ${dbPath}`);

    // Load coordination state
    const coordination = await readCoordination(config.coordinationPath);
    console.error(`Coordination state loaded from ${config.coordinationPath}`);

    // Get all paths and extensions to index
    const docsPaths = getAllDocsPaths(config);
    const fileExtensions = getFileExtensions(config);
    const ignorePatterns = ['.git', 'node_modules', '.tmp'];

    // Initial indexing (#19)
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

    // Start file watcher (#4)
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
      config.debounceDelay
    );
    console.error(`File watcher started for ${docsPaths.length} path(s)`);

    // Create and start server (pass db and coordination for tools)
    const server = createServer(config, db, coordination);
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
  } catch (error) {
    console.error('Fatal error in main():', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error in main():', error);
  process.exit(1);
});
