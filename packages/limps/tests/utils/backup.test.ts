import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import {
  createBackup,
  pruneBackups,
  listBackups,
  getBackupPath,
  BACKUP_DIR,
} from '../../src/utils/backup.js';

describe('backup.ts', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'test.md');
    writeFileSync(testFile, '# Test Content\n\nSome text here.');
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getBackupPath', () => {
    it('generates backup path with timestamp', () => {
      const timestamp = new Date('2026-01-20T12:30:45Z');
      const backupPath = getBackupPath(testFile, testDir, timestamp);

      // Should be in .backups directory
      expect(backupPath).toContain(BACKUP_DIR);
      // Should preserve relative structure
      expect(backupPath).toContain('test.md');
      // Timestamp should use - instead of : for Windows compatibility
      expect(backupPath).toContain('2026-01-20T12-30-45');
      expect(backupPath).toContain('.bak');
    });

    it('handles nested paths correctly', () => {
      const nestedFile = join(testDir, 'examples', 'component.jsx');
      const timestamp = new Date('2026-01-20T12:00:00Z');
      const backupPath = getBackupPath(nestedFile, testDir, timestamp);

      expect(backupPath).toContain(join(BACKUP_DIR, 'examples'));
      expect(backupPath).toContain('component.jsx');
    });

    it('uses current time when no timestamp provided', () => {
      const now = new Date();
      const backupPath = getBackupPath(testFile, testDir);

      // Extract timestamp from path
      const match = backupPath.match(/\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.bak$/);
      expect(match).toBeTruthy();

      if (match) {
        const [, datePart, hour, minute, second] = match;
        const isoString = `${datePart}T${hour}:${minute}:${second}Z`;
        const pathTime = new Date(isoString);

        // Timestamp should be within 2 seconds of now
        const diff = Math.abs(pathTime.getTime() - now.getTime());
        expect(diff).toBeLessThan(2000);
      }
    });
  });

  describe('createBackup', () => {
    it('creates backup with timestamp', async () => {
      const result = await createBackup(testFile, testDir);

      expect(result.path).toBe(testFile);
      expect(result.backupPath).toContain(BACKUP_DIR);
      expect(result.backupPath).toContain('.bak');
      expect(result.timestamp).toBeDefined();

      // Verify backup file exists
      expect(existsSync(result.backupPath)).toBe(true);

      // Verify content matches
      const backupContent = readFileSync(result.backupPath, 'utf-8');
      const originalContent = readFileSync(testFile, 'utf-8');
      expect(backupContent).toBe(originalContent);
    });

    it('creates backup directory if missing', async () => {
      const backupsDir = join(testDir, BACKUP_DIR);

      // Ensure backups dir doesn't exist
      expect(existsSync(backupsDir)).toBe(false);

      await createBackup(testFile, testDir);

      expect(existsSync(backupsDir)).toBe(true);
    });

    it('handles nested file paths', async () => {
      // Create nested file
      const nestedDir = join(testDir, 'examples');
      mkdirSync(nestedDir, { recursive: true });
      const nestedFile = join(nestedDir, 'component.jsx');
      writeFileSync(nestedFile, 'export default function() {}');

      const result = await createBackup(nestedFile, testDir);

      expect(result.backupPath).toContain(join(BACKUP_DIR, 'examples'));
      expect(existsSync(result.backupPath)).toBe(true);
    });

    it('throws error for non-existent file', async () => {
      const nonExistent = join(testDir, 'does-not-exist.md');

      await expect(createBackup(nonExistent, testDir)).rejects.toThrow();
    });

    it('skips directory backup and returns empty backupPath', async () => {
      const dirPath = join(testDir, 'docs-dir');
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(join(dirPath, 'note.md'), '# Note');

      const result = await createBackup(dirPath, testDir);
      expect(result.path).toBe(dirPath);
      expect(result.backupPath).toBe('');
    });
  });

  describe('listBackups', () => {
    it('lists backups for a file sorted by timestamp (newest first)', async () => {
      // Create multiple backups
      const timestamps = [
        new Date('2026-01-18T10:00:00Z'),
        new Date('2026-01-20T10:00:00Z'),
        new Date('2026-01-19T10:00:00Z'),
      ];

      const backupsDir = join(testDir, BACKUP_DIR);
      mkdirSync(backupsDir, { recursive: true });

      for (const ts of timestamps) {
        const backupPath = getBackupPath(testFile, testDir, ts);
        mkdirSync(dirname(backupPath), { recursive: true });
        writeFileSync(backupPath, `Backup from ${ts.toISOString()}`);
      }

      const backups = await listBackups(testFile, testDir);

      expect(backups).toHaveLength(3);
      // Should be sorted newest first
      expect(backups[0].timestamp).toContain('2026-01-20');
      expect(backups[1].timestamp).toContain('2026-01-19');
      expect(backups[2].timestamp).toContain('2026-01-18');
    });

    it('returns empty array when no backups exist', async () => {
      const backups = await listBackups(testFile, testDir);
      expect(backups).toEqual([]);
    });

    it('only lists backups for the specific file', async () => {
      const backupsDir = join(testDir, BACKUP_DIR);
      mkdirSync(backupsDir, { recursive: true });

      // Create backup for test file
      await createBackup(testFile, testDir);

      // Create another file and its backup
      const otherFile = join(testDir, 'other.md');
      writeFileSync(otherFile, 'Other content');
      await createBackup(otherFile, testDir);

      const backups = await listBackups(testFile, testDir);
      expect(backups).toHaveLength(1);
      expect(backups[0].path).toBe(testFile);
    });
  });

  describe('pruneBackups', () => {
    it('keeps minimum 3 backups regardless of age', async () => {
      const backupsDir = join(testDir, BACKUP_DIR);
      mkdirSync(backupsDir, { recursive: true });

      // Create 5 old backups (older than 7 days)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      for (let i = 0; i < 5; i++) {
        const ts = new Date(oldDate);
        ts.setHours(ts.getHours() + i);
        const backupPath = getBackupPath(testFile, testDir, ts);
        mkdirSync(dirname(backupPath), { recursive: true });
        writeFileSync(backupPath, `Backup ${i}`);
      }

      const pruned = await pruneBackups(testFile, testDir);

      // Should prune 2 (keep 3 minimum)
      expect(pruned).toBe(2);

      const remaining = await listBackups(testFile, testDir);
      expect(remaining).toHaveLength(3);
    });

    it('prunes backups older than 7 days', async () => {
      const backupsDir = join(testDir, BACKUP_DIR);
      mkdirSync(backupsDir, { recursive: true });

      // Create 2 old backups (older than 7 days)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      for (let i = 0; i < 2; i++) {
        const ts = new Date(oldDate);
        ts.setHours(ts.getHours() + i);
        const backupPath = getBackupPath(testFile, testDir, ts);
        mkdirSync(dirname(backupPath), { recursive: true });
        writeFileSync(backupPath, `Old backup ${i}`);
      }

      // Create 3 recent backups
      for (let i = 0; i < 3; i++) {
        const ts = new Date();
        ts.setHours(ts.getHours() - i);
        const backupPath = getBackupPath(testFile, testDir, ts);
        mkdirSync(dirname(backupPath), { recursive: true });
        writeFileSync(backupPath, `Recent backup ${i}`);
      }

      const pruned = await pruneBackups(testFile, testDir);

      // Should prune 2 old backups (have 3 recent ones)
      expect(pruned).toBe(2);

      const remaining = await listBackups(testFile, testDir);
      expect(remaining).toHaveLength(3);
    });

    it('returns 0 when nothing to prune', async () => {
      // Create 2 recent backups
      await createBackup(testFile, testDir);
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      await createBackup(testFile, testDir);

      const pruned = await pruneBackups(testFile, testDir);
      expect(pruned).toBe(0);
    });

    it('returns 0 when no backups exist', async () => {
      const pruned = await pruneBackups(testFile, testDir);
      expect(pruned).toBe(0);
    });

    it('respects custom retention options', async () => {
      const backupsDir = join(testDir, BACKUP_DIR);
      mkdirSync(backupsDir, { recursive: true });

      // Create 5 backups from 3 days ago
      const date = new Date();
      date.setDate(date.getDate() - 3);

      for (let i = 0; i < 5; i++) {
        const ts = new Date(date);
        ts.setHours(ts.getHours() + i);
        const backupPath = getBackupPath(testFile, testDir, ts);
        mkdirSync(dirname(backupPath), { recursive: true });
        writeFileSync(backupPath, `Backup ${i}`);
      }

      // Prune with 2-day retention and min 2 backups
      const pruned = await pruneBackups(testFile, testDir, {
        retentionDays: 2,
        minBackups: 2,
      });

      // Should prune 3 (keep 2 minimum)
      expect(pruned).toBe(3);

      const remaining = await listBackups(testFile, testDir);
      expect(remaining).toHaveLength(2);
    });
  });

  describe('BACKUP_DIR', () => {
    it('is .backups', () => {
      expect(BACKUP_DIR).toBe('.backups');
    });
  });
});
