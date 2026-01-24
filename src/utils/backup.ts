/**
 * Backup utilities for MCP document CRUD operations.
 * Creates timestamped backups before destructive operations and handles pruning.
 */

import { copyFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename, relative } from 'path';
import { notFound } from './errors.js';

/**
 * Backup directory name (relative to repo root).
 */
export const BACKUP_DIR = '.backups';

/**
 * Default backup retention: 7 days.
 */
const DEFAULT_RETENTION_DAYS = 7;

/**
 * Minimum backups to keep regardless of age.
 */
const DEFAULT_MIN_BACKUPS = 3;

/**
 * Result of a backup operation.
 */
export interface BackupResult {
  /** Original file path */
  path: string;
  /** Path to the backup file */
  backupPath: string;
  /** ISO timestamp of the backup */
  timestamp: string;
}

/**
 * Options for backup operations.
 */
export interface BackupOptions {
  /** Number of days to retain backups (default: 7) */
  retentionDays?: number;
  /** Minimum backups to keep regardless of age (default: 3) */
  minBackups?: number;
}

/**
 * Format a date for use in backup/trash filenames.
 * Uses ISO format with colons replaced by dashes for Windows compatibility.
 *
 * @param date - Date to format
 * @returns Formatted timestamp string (e.g., "2026-01-20T12-30-45")
 * @example
 * formatTimestamp(new Date('2026-01-20T12:30:45Z'));
 * // Returns: "2026-01-20T12-30-45"
 */
export function formatTimestamp(date: Date): string {
  // Format: 2026-01-20T12-30-45
  return date
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, '');
}

/**
 * Parse a timestamp from a backup filename.
 */
function parseTimestamp(filename: string): Date | null {
  // Match: filename.YYYY-MM-DDTHH-MM-SS.bak
  const match = filename.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.bak$/);
  if (!match) return null;

  // Convert back to ISO format
  const isoString =
    match[1].replace(/-/g, (char, index) => {
      // Keep dashes for date part (indices 4, 7), replace with colons for time (indices 13, 16)
      return index > 9 ? ':' : char;
    }) + 'Z';

  return new Date(isoString);
}

/**
 * Get the backup path for a file.
 *
 * @param filePath - Absolute path to the original file
 * @param repoRoot - Absolute path to repository root
 * @param timestamp - Optional timestamp (defaults to now)
 * @returns Absolute path for the backup file
 */
export function getBackupPath(
  filePath: string,
  repoRoot: string,
  timestamp: Date = new Date()
): string {
  // Get relative path from repo root
  const relativePath = relative(repoRoot, filePath);

  // Build backup path: .backups/{relative-path}.{timestamp}.bak
  const backupFilename = `${basename(relativePath)}.${formatTimestamp(timestamp)}.bak`;
  const backupDir = join(repoRoot, BACKUP_DIR, dirname(relativePath));

  return join(backupDir, backupFilename);
}

/**
 * Create a backup of a file.
 *
 * @param filePath - Absolute path to the file to backup
 * @param repoRoot - Absolute path to repository root
 * @returns Backup result with paths and timestamp
 * @throws DocumentError if file doesn't exist
 */
export async function createBackup(filePath: string, repoRoot: string): Promise<BackupResult> {
  // Verify file exists
  if (!existsSync(filePath)) {
    throw notFound(relative(repoRoot, filePath));
  }

  const timestamp = new Date();
  const backupPath = getBackupPath(filePath, repoRoot, timestamp);

  // Ensure backup directory exists
  const backupDir = dirname(backupPath);
  await mkdir(backupDir, { recursive: true });

  // Copy file to backup location
  await copyFile(filePath, backupPath);

  return {
    path: filePath,
    backupPath,
    timestamp: formatTimestamp(timestamp),
  };
}

/**
 * List all backups for a file, sorted by timestamp (newest first).
 *
 * @param filePath - Absolute path to the original file
 * @param repoRoot - Absolute path to repository root
 * @returns Array of backup results
 */
export async function listBackups(filePath: string, repoRoot: string): Promise<BackupResult[]> {
  const relativePath = relative(repoRoot, filePath);
  const backupDir = join(repoRoot, BACKUP_DIR, dirname(relativePath));

  // If backup directory doesn't exist, no backups
  if (!existsSync(backupDir)) {
    return [];
  }

  const filename = basename(relativePath);
  const backupPrefix = `${filename}.`;
  const backupSuffix = '.bak';

  // Find all backups for this file
  const entries = await readdir(backupDir);
  const backups: BackupResult[] = [];

  for (const entry of entries) {
    if (entry.startsWith(backupPrefix) && entry.endsWith(backupSuffix)) {
      const timestamp = parseTimestamp(entry);
      if (timestamp) {
        backups.push({
          path: filePath,
          backupPath: join(backupDir, entry),
          timestamp: formatTimestamp(timestamp),
        });
      }
    }
  }

  // Sort by timestamp, newest first
  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return backups;
}

/**
 * Prune old backups for a file.
 * Keeps backups newer than retention period OR minimum count, whichever keeps more.
 *
 * @param filePath - Absolute path to the original file
 * @param repoRoot - Absolute path to repository root
 * @param options - Pruning options
 * @returns Number of backups pruned
 */
export async function pruneBackups(
  filePath: string,
  repoRoot: string,
  options: BackupOptions = {}
): Promise<number> {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const minBackups = options.minBackups ?? DEFAULT_MIN_BACKUPS;

  const backups = await listBackups(filePath, repoRoot);

  if (backups.length <= minBackups) {
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffTimestamp = formatTimestamp(cutoffDate);

  let prunedCount = 0;

  // Process backups from oldest to newest (reverse of the sorted list)
  // But keep at least minBackups
  for (let i = backups.length - 1; i >= 0; i--) {
    // Always keep minimum backups
    if (backups.length - prunedCount <= minBackups) {
      break;
    }

    const backup = backups[i];

    // Only prune if older than retention period
    if (backup.timestamp < cutoffTimestamp) {
      try {
        await unlink(backup.backupPath);
        prunedCount++;
      } catch {
        // Ignore errors (file may already be deleted)
      }
    }
  }

  return prunedCount;
}
