import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { spawn } from 'child_process';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { readCoordination } from '../src/coordination.js';
import { loadConfig } from '../src/config.js';
import {
  handleOpenDocumentInCursor,
  openInCursor,
  isCursorCliAvailable,
} from '../src/tools/open-document-in-cursor.js';
import type { ToolContext } from '../src/types.js';

// Mock open package
vi.mock('open', () => ({
  default: vi.fn(),
}));

// Mock child_process.spawn
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

// Mock which package
vi.mock('which', () => ({
  default: {
    sync: vi.fn(),
  },
}));

describe('open-document-in-cursor', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let repoRoot: string;
  let coordinationPath: string;
  let context: ToolContext;
  let openMock: ReturnType<typeof vi.fn>;
  let spawnMock: ReturnType<typeof vi.fn>;
  let whichMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    repoRoot = testDir;
    coordinationPath = join(testDir, 'coordination.json');

    mkdirSync(repoRoot, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.coordinationPath = coordinationPath;
    config.plansPath = join(repoRoot, 'plans');
    config.docsPaths = [repoRoot];

    const coordination = await readCoordination(coordinationPath);

    context = {
      db,
      coordination,
      config,
    };

    // Setup mocks
    const openModule = await import('open');
    openMock = openModule.default as ReturnType<typeof vi.fn>;
    openMock.mockResolvedValue(undefined);

    spawnMock = vi.mocked(spawn);
    spawnMock.mockReturnValue({
      unref: vi.fn(),
    } as unknown as ReturnType<typeof spawn>);

    const whichModule = await import('which');
    whichMock = whichModule.default.sync as ReturnType<typeof vi.fn>;
    whichMock.mockReturnValue('/usr/local/bin/cursor');
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      // dbPath cleanup handled by db.close() in most cases
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('open-valid-path', () => {
    it('should open file with valid absolute path', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      const result = await handleOpenDocumentInCursor({ path: 'test.md' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.success).toBe(true);
      expect(output.method).toBe('uri');

      // Verify open was called with correct URI
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/^cursor:\/\/file\/.*\/test\.md$/),
        expect.any(Object)
      );
    });
  });

  describe('open-with-line', () => {
    it('should open file with line number', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, '# Test\nLine 2\nLine 3', 'utf-8');

      const result = await handleOpenDocumentInCursor({ path: 'test.md', line: 2 }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.success).toBe(true);
      expect(output.method).toBe('uri');

      // Verify URI includes line number
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/^cursor:\/\/file\/.*\/test\.md:2$/),
        expect.any(Object)
      );
    });
  });

  describe('open-with-line-column', () => {
    it('should open file with line and column', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, '# Test\nLine 2\nLine 3', 'utf-8');

      const result = await handleOpenDocumentInCursor(
        { path: 'test.md', line: 2, column: 10 },
        context
      );

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.success).toBe(true);
      expect(output.method).toBe('uri');

      // Verify URI includes line and column
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/^cursor:\/\/file\/.*\/test\.md:2:10$/),
        expect.any(Object)
      );
    });
  });

  describe('open-invalid-path', () => {
    it('should return error for invalid path', async () => {
      const result = await handleOpenDocumentInCursor({ path: 'nonexistent.md' }, context);

      expect(result.isError).toBeTruthy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
      expect(output.error).toContain('not found');
    });
  });

  describe('open-relative-path', () => {
    it('should resolve relative paths to absolute', async () => {
      const subDir = join(repoRoot, 'subdir');
      mkdirSync(subDir, { recursive: true });
      const filePath = join(subDir, 'test.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      const result = await handleOpenDocumentInCursor({ path: 'subdir/test.md' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.success).toBe(true);
      expect(output.method).toBe('uri');

      // Verify absolute path was used in URI
      expect(openMock).toHaveBeenCalledWith(expect.stringContaining(filePath), expect.any(Object));
    });
  });

  describe('open-uri-fallback-cli', () => {
    it('should fall back to CLI if URI fails', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      // Mock URI failure
      openMock.mockRejectedValueOnce(new Error('URI protocol failed'));

      const result = await openInCursor(filePath);

      expect(result.success).toBe(true);
      expect(result.method).toBe('cli');

      // Verify spawn was called with cursor command
      expect(spawnMock).toHaveBeenCalledWith(
        'cursor',
        [filePath],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
        })
      );
    });

    it('should use CLI with line and column', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      // Mock URI failure
      openMock.mockRejectedValueOnce(new Error('URI protocol failed'));

      const result = await openInCursor(filePath, { line: 5, column: 10 });

      expect(result.success).toBe(true);
      expect(result.method).toBe('cli');

      // Verify spawn was called with -g flag
      expect(spawnMock).toHaveBeenCalledWith(
        'cursor',
        ['-g', `${filePath}:5:10`],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
        })
      );
    });

    it('should return failed if both URI and CLI fail', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      // Mock URI failure
      openMock.mockRejectedValueOnce(new Error('URI protocol failed'));
      // Mock CLI unavailable
      whichMock.mockImplementationOnce(() => {
        throw new Error('not found');
      });

      const result = await openInCursor(filePath);

      expect(result.success).toBe(false);
      expect(result.method).toBe('failed');
      expect(result.error).toBeDefined();
    });
  });

  describe('open-handle-special-chars', () => {
    it('should handle special characters in path', async () => {
      const filePath = join(repoRoot, 'test#file?.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      const result = await handleOpenDocumentInCursor({ path: 'test#file?.md' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.success).toBe(true);

      // Verify URI was URL encoded
      const callArgs = openMock.mock.calls[0][0] as string;
      expect(callArgs).toContain('%23'); // # encoded
      expect(callArgs).toContain('%3F'); // ? encoded
    });

    it('should handle spaces in path', async () => {
      const filePath = join(repoRoot, 'test file.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      const result = await handleOpenDocumentInCursor({ path: 'test file.md' }, context);

      expect(result.isError).toBeFalsy();
      const resultText = result.content[0].text;
      const output = JSON.parse(resultText);
      expect(output.success).toBe(true);

      // Verify URI was URL encoded
      const callArgs = openMock.mock.calls[0][0] as string;
      expect(callArgs).toContain('%20'); // space encoded
    });
  });

  describe('isCursorCliAvailable', () => {
    it('should return true when cursor CLI is available', () => {
      whichMock.mockReturnValueOnce('/usr/local/bin/cursor');
      expect(isCursorCliAvailable()).toBe(true);
    });

    it('should return false when cursor CLI is not available', () => {
      whichMock.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      expect(isCursorCliAvailable()).toBe(false);
    });
  });

  describe('openInCursor utility', () => {
    it('should return appropriate method in response', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      const result = await openInCursor(filePath);

      expect(result.success).toBe(true);
      expect(result.method).toBe('uri');
      expect(result.error).toBeUndefined();
    });

    it('should handle Windows shell compatibility', async () => {
      const filePath = join(repoRoot, 'test.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      // Mock URI failure
      openMock.mockRejectedValueOnce(new Error('URI protocol failed'));

      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
      });

      try {
        await openInCursor(filePath);

        // Verify spawn was called with shell: true on Windows
        expect(spawnMock).toHaveBeenCalledWith(
          'cursor',
          [filePath],
          expect.objectContaining({
            shell: true,
            detached: true,
            stdio: 'ignore',
          })
        );
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          writable: true,
        });
      }
    });
  });
});
