/**
 * Shared repository/document root resolution for MCP tools.
 *
 * Two root-resolution strategies exist because the fallback (when docsPaths is
 * unset) must differ by use-case:
 *
 * - CRUD tools need relative paths that include the `plans/` prefix so that
 *   `isProtectedPlanFile()` regex checks work correctly.
 * - The listing tool needs a tighter scope (plansPath itself) to avoid
 *   enumerating the entire repo and exhausting file descriptors.
 */

import { dirname } from 'path';
import type { ServerConfig } from '../config.js';

/**
 * Get the effective document root for MCP CRUD tools.
 *
 * When `docsPaths` is configured, `docsPaths[0]` is used as the root.
 * Otherwise falls back to `dirname(plansPath)` so that relative paths
 * retain the `plans/` prefix required by `isProtectedPlanFile`.
 */
export function getDocsRoot(config: Pick<ServerConfig, 'plansPath' | 'docsPaths'>): string {
  if (config.docsPaths && config.docsPaths.length > 0) {
    return config.docsPaths[0];
  }
  return dirname(config.plansPath);
}

/**
 * Get the scoped root for directory listing (`list_docs`).
 *
 * When `docsPaths` is configured, `docsPaths[0]` is used.
 * Otherwise falls back to `plansPath` itself to prevent listing the
 * entire repository (which can exhaust file descriptors).
 */
export function getListingRoot(config: Pick<ServerConfig, 'plansPath' | 'docsPaths'>): string {
  if (config.docsPaths && config.docsPaths.length > 0) {
    return config.docsPaths[0];
  }
  return config.plansPath;
}
