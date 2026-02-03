/**
 * Health check: Code drift detection.
 *
 * Compares files listed in agent frontmatter against actual filesystem.
 * Detects missing files and suggests possible renames via fuzzy matching.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { findPlanDirectory, getAgentFiles } from './list-agents.js';
import type { ServerConfig } from '../config.js';
import type { AgentFrontmatter } from '../agent-parser.js';

/**
 * File entry in agent frontmatter.
 * Can be a simple string or an object with path and metadata.
 */
type FileEntry = AgentFrontmatter['files'][number];

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

/** Entry in the file index used for fuzzy matching. */
interface FileIndexEntry {
  path: string;
  basename: string;
  nameWithoutExt: string;
}

/**
 * Build an index of files under codebasePath for reuse across multiple lookups.
 * Skips node_modules, .git, dist, build, .tmp.
 *
 * @param codebasePath - Root path of the codebase
 * @returns Array of file entries (path, basename, nameWithoutExt)
 */
export function buildFileIndex(codebasePath: string): FileIndexEntry[] {
  const entries: FileIndexEntry[] = [];

  function searchDir(dir: string, relativePath = ''): void {
    try {
      const items = readdirSync(dir, { withFileTypes: true });
      for (const entry of items) {
        const entryPath = join(dir, entry.name);
        const relPath = relativePath ? join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.tmp'].includes(entry.name)) {
            continue;
          }
          searchDir(entryPath, relPath);
        } else if (entry.isFile()) {
          const nameWithoutExt = entry.name.replace(/\.[^.]+$/, '');
          entries.push({ path: relPath, basename: entry.name, nameWithoutExt });
        }
      }
    } catch {
      // Directory read failed, skip
    }
  }

  searchDir(codebasePath);
  return entries;
}

/**
 * Find a similar file from a pre-built index using fuzzy matching.
 *
 * @param index - Result of buildFileIndex(codebasePath)
 * @param filename - Filename to search for (basename only)
 * @returns Relative path to similar file, or null if not found
 */
export function findSimilarFileFromIndex(index: FileIndexEntry[], filename: string): string | null {
  const targetBase = basename(filename);
  const targetWithoutExt = targetBase.replace(/\.[^.]+$/, '');

  const candidates: { path: string; score: number }[] = [];

  for (const entry of index) {
    let score = 0;

    if (entry.basename === targetBase) {
      score = 100;
    } else if (entry.nameWithoutExt === targetWithoutExt) {
      score = 80;
    } else if (entry.nameWithoutExt.includes(targetWithoutExt)) {
      score = 50;
    } else if (
      targetWithoutExt.includes(entry.nameWithoutExt) &&
      entry.nameWithoutExt.length >= 4
    ) {
      score = 40;
    } else if (
      Math.abs(entry.nameWithoutExt.length - targetWithoutExt.length) <= 2 &&
      entry.nameWithoutExt.length >= 4
    ) {
      const common = [...entry.nameWithoutExt].filter((c) => targetWithoutExt.includes(c)).length;
      const ratio = common / Math.max(entry.nameWithoutExt.length, targetWithoutExt.length);
      if (ratio > 0.7) {
        score = Math.floor(ratio * 30);
      }
    }

    if (score > 0) {
      candidates.push({ path: entry.path, score });
    }
  }

  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].path;
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
  const index = buildFileIndex(codebasePath);
  return findSimilarFileFromIndex(index, filename);
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
/** Reject path traversal in codebasePath (e.g. "../" or "..\\"). */
function isSafeCodebasePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return !normalized.split('/').includes('..');
}

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

  if (!isSafeCodebasePath(codebasePath)) {
    result.error = 'codebasePath must not contain ".." (path traversal not allowed)';
    return result;
  }

  // Find plan directory
  const planDir = findPlanDirectory(config.plansPath, planId);
  if (!planDir) {
    result.error = `Plan not found: ${planId}`;
    return result;
  }

  // Validate codebase path so we don't report every file as missing or skip scanning
  try {
    const codebaseStat = statSync(codebasePath);
    if (!codebaseStat.isDirectory()) {
      result.error = `Codebase path is not a directory: ${codebasePath}`;
      return result;
    }
  } catch {
    result.error = `Codebase path does not exist or is not readable: ${codebasePath}`;
    return result;
  }

  // Get agents
  let agents = getAgentFiles(planDir);

  // Filter to specific agent if requested
  if (agentNumber) {
    agents = agents.filter((a) => a.agentNumber === agentNumber);
  }

  result.agentsChecked = agents.length;

  // Build file index once for all missing-file lookups (avoids O(missing × repo) scans)
  const fileIndex = buildFileIndex(codebasePath);

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

      // File doesn't exist - check for similar file (reuses fileIndex)
      const suggestion = findSimilarFileFromIndex(fileIndex, basename(filePath));

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
