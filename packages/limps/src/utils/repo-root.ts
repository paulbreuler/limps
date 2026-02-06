/**
 * Shared repo-root resolution used by every MCP tool that needs to
 * convert relative paths to absolute paths.
 *
 * Single source of truth — keeps all tools consistent and prevents
 * the "dirname(plansPath) indexes the whole repo" class of bugs.
 */

import type { ServerConfig } from '../config.js';

/**
 * Resolve the repository root directory from config.
 *
 * When `docsPaths` is configured the first entry is treated as the
 * project root (it may be the repo root or any other parent directory
 * the user wants to expose).
 *
 * When `docsPaths` is **not** configured (the common default),
 * `plansPath` itself is used as the root.  This guarantees that
 * `list_docs`, `process_doc`, `create_doc`, etc. all agree on the
 * same root and prevents accidental traversal into the parent
 * directory (which previously caused full-repo indexing and
 * file-descriptor exhaustion).
 *
 * @param config - Server configuration (only `plansPath` and
 *   `docsPaths` are read)
 * @returns Absolute path to use as the repository / project root
 */
export function getRepoRoot(config: Pick<ServerConfig, 'plansPath' | 'docsPaths'>): string {
  if (config.docsPaths && config.docsPaths.length > 0) {
    return config.docsPaths[0];
  }
  return config.plansPath;
}
