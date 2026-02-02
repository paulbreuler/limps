/**
 * Health check: Code drift detection.
 *
 * Compares files listed in agent frontmatter against actual filesystem.
 * Detects missing files and suggests possible renames via fuzzy matching.
 */

import { existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { findPlanDirectory, getAgentFiles } from './list-agents.js';
import type { ServerConfig } from '../config.js';

/**
 * File entry in agent frontmatter.
 * Can be a simple string or an object with path and metadata.
 */
type FileEntry = string | { path: string; action?: string; repo?: string };

/**
 * Drift entry representing a file discrepancy.
 */
export interface DriftEntry {
  /** Task ID (planFolder#agentNumber) */
  taskId: string;
  /** Agent number (e.g., "000") */
  agentNumber: string;
  /** Agent title from first heading */
  agentTitle: string;
  /** Path to the agent file */
  agentPath: string;
  /** File path listed in frontmatter */
  listedFile: string;
  /** Reason for drift: missing or renamed */
  reason: 'missing' | 'renamed';
  /** Suggested replacement path (fuzzy match) */
  suggestion?: string;
}

/**
 * Result of a drift check operation.
 */
export interface DriftCheckResult {
  /** List of drift entries found */
  drifts: DriftEntry[];
  /** Total files checked across all agents */
  totalFilesChecked: number;
  /** Number of agents checked */
  agentsChecked: number;
  /** Number of external repo files skipped */
  skippedExternal: number;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Normalize a file entry to a path string.
 * Returns null for entries that should be skipped (external repos, empty, invalid).
 *
 * @param entry - File entry from frontmatter
 * @returns Normalized path or null if should skip
 */
export function normalizeFilePath(entry: FileEntry): string | null {
  if (typeof entry === 'string') {
    return entry.trim() || null;
  }

  if (typeof entry === 'object' && entry !== null) {
    // Skip external repo files
    if (entry.repo) {
      return null;
    }
    // Extract path from object
    if (entry.path && typeof entry.path === 'string') {
      return entry.path.trim() || null;
    }
  }

  return null;
}

/**
 * Find a similar file in the codebase using fuzzy matching.
 * Searches for files with the same or similar basename.
 *
 * @param codebasePath - Root path of the codebase
 * @param filename - Filename to search for (basename only)
 * @returns Relative path to similar file, or null if not found
 */
export function findSimilarFile(codebasePath: string, filename: string): string | null {
  const targetBase = basename(filename);
  const targetWithoutExt = targetBase.replace(/\.[^.]+$/, '');

  const candidates: { path: string; score: number }[] = [];

  // Recursive search function
  function searchDir(dir: string, relativePath = ''): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dir, entry.name);
        const relPath = relativePath ? join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          // Skip common non-source directories
          if (['node_modules', '.git', 'dist', 'build', '.tmp'].includes(entry.name)) {
            continue;
          }
          searchDir(entryPath, relPath);
        } else if (entry.isFile()) {
          const entryBase = entry.name;
          const entryWithoutExt = entryBase.replace(/\.[^.]+$/, '');

          // Calculate similarity score
          let score = 0;

          // Exact match (different directory)
          if (entryBase === targetBase) {
            score = 100;
          }
          // Same name, different extension
          else if (entryWithoutExt === targetWithoutExt) {
            score = 80;
          }
          // Name contains target
          else if (entryWithoutExt.includes(targetWithoutExt)) {
            score = 50;
          }
          // Target contains name
          else if (targetWithoutExt.includes(entryWithoutExt) && entryWithoutExt.length >= 4) {
            score = 40;
          }
          // Levenshtein-like check: allow 1-2 char difference
          else if (
            Math.abs(entryWithoutExt.length - targetWithoutExt.length) <= 2 &&
            entryWithoutExt.length >= 4
          ) {
            // Simple character overlap check
            const common = [...entryWithoutExt].filter((c) => targetWithoutExt.includes(c)).length;
            const ratio = common / Math.max(entryWithoutExt.length, targetWithoutExt.length);
            if (ratio > 0.7) {
              score = Math.floor(ratio * 30);
            }
          }

          if (score > 0) {
            candidates.push({ path: relPath, score });
          }
        }
      }
    } catch {
      // Directory read failed, skip
    }
  }

  searchDir(codebasePath);

  if (candidates.length === 0) {
    return null;
  }

  // Sort by score descending, return best match
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].path;
}

/**
 * Check for file drift in a plan's agents.
 *
 * @param config - Server configuration with plansPath
 * @param planId - Plan number or name
 * @param codebasePath - Root path of the codebase to check against
 * @param agentNumber - Optional specific agent number to check
 * @returns Drift check result
 */
export function checkFileDrift(
  config: ServerConfig,
  planId: string,
  codebasePath: string,
  agentNumber?: string
): DriftCheckResult {
  const result: DriftCheckResult = {
    drifts: [],
    totalFilesChecked: 0,
    agentsChecked: 0,
    skippedExternal: 0,
  };

  // Find plan directory
  const planDir = findPlanDirectory(config.plansPath, planId);
  if (!planDir) {
    result.error = `Plan not found: ${planId}`;
    return result;
  }

  // Get agents
  let agents = getAgentFiles(planDir);

  // Filter to specific agent if requested
  if (agentNumber) {
    agents = agents.filter((a) => a.agentNumber === agentNumber);
  }

  result.agentsChecked = agents.length;

  // Check each agent's files
  for (const agent of agents) {
    const files = agent.frontmatter.files || [];

    for (const fileEntry of files) {
      const filePath = normalizeFilePath(fileEntry as FileEntry);

      if (filePath === null) {
        // External repo or invalid entry
        if (typeof fileEntry === 'object' && (fileEntry as { repo?: string }).repo) {
          result.skippedExternal++;
        }
        continue;
      }

      result.totalFilesChecked++;

      // Check if file exists
      const fullPath = join(codebasePath, filePath);
      if (existsSync(fullPath)) {
        continue; // File exists, no drift
      }

      // File doesn't exist - check for similar file
      const suggestion = findSimilarFile(codebasePath, basename(filePath));

      const drift: DriftEntry = {
        taskId: agent.taskId,
        agentNumber: agent.agentNumber,
        agentTitle: agent.title,
        agentPath: agent.path,
        listedFile: filePath,
        reason: suggestion ? 'renamed' : 'missing',
        suggestion: suggestion || undefined,
      };

      result.drifts.push(drift);
    }
  }

  return result;
}
