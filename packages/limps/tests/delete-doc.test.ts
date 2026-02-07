import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import {
  handleDeleteDoc,
  DeleteDocInputSchema,
  PROTECTED_FILES,
  TRASH_DIR,
} from '../src/tools/delete-doc.js';
import { createSchema } from '../src/indexer.js';
import type { ToolContext } from '../src/types.js';
import type { ServerConfig } from '../src/config.js';

describe('delete-doc.ts', () => {
  let testDir: string;
  let db: Database.Database;
  let context: ToolContext;

  beforeEach(() => {
    // Create unique temp directory
    testDir = join(
      tmpdir(),
      `delete-doc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });

    // Create test file structure
    mkdirSync(join(testDir, 'addendums'), { recursive: true });
    mkdirSync(join(testDir, 'examples'), { recursive: true });
    mkdirSync(join(testDir, 'research'), { recursive: true });

    // Create in-memory database
    db = new Database(':memory:');
    createSchema(db);

    // Create context
    const config: ServerConfig = {
      plansPath: join(testDir, 'plans'),
      dataPath: join(testDir, 'data'),
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    context = {
      db,
      config,
    };
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('DeleteDocInputSchema', () => {
    it('validates valid input', () => {
      const result = DeleteDocInputSchema.safeParse({
        path: 'research/notes.md',
      });
      expect(result.success).toBe(true);
    });

    it('validates input with confirm flag', () => {
      const result = DeleteDocInputSchema.safeParse({
        path: 'research/notes.md',
        confirm: true,
      });
      expect(result.success).toBe(true);
    });

    it('validates input with permanent flag', () => {
      const result = DeleteDocInputSchema.safeParse({
        path: 'research/notes.md',
        confirm: true,
        permanent: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty path', () => {
      const result = DeleteDocInputSchema.safeParse({
        path: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('handleDeleteDoc', () => {
    describe('confirmation flow', () => {
      it('returns pending without confirm flag', async () => {
        const testFile = join(testDir, 'research', 'notes.md');
        writeFileSync(testFile, '# Research Notes\n\nSome content here.');

        const result = await handleDeleteDoc({ path: 'research/notes.md' }, context);

        expect(result.isError).toBeFalsy();
        const response = JSON.parse(result.content[0].text);
        expect(response.pending).toBe(true);
        expect(response.deleted).toBeFalsy();
        expect(response.preview).toBeDefined();
        expect(response.preview).toContain('Research Notes');

        // File should still exist
        expect(existsSync(testFile)).toBe(true);
      });

      it('shows file preview (first 500 chars)', async () => {
        const longContent = '# Title\n\n' + 'A'.repeat(600);
        const testFile = join(testDir, 'research', 'notes.md');
        writeFileSync(testFile, longContent);

        const result = await handleDeleteDoc({ path: 'research/notes.md' }, context);

        const response = JSON.parse(result.content[0].text);
        expect(response.preview.length).toBeLessThanOrEqual(503); // 500 + "..."
        expect(response.preview).toContain('...');
      });

      it('shows directory preview for directory deletes', async () => {
        const dirPath = join(testDir, 'research', 'folder-to-delete');
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(join(dirPath, 'note.md'), '# Nested note');

        const result = await handleDeleteDoc({ path: 'research/folder-to-delete' }, context);

        const response = JSON.parse(result.content[0].text);
        expect(response.pending).toBe(true);
        expect(response.preview).toBe('Directory: research/folder-to-delete');
      });
    });

    describe('soft delete', () => {
      it('moves file to trash with confirm flag', async () => {
        const testFile = join(testDir, 'research', 'old-notes.md');
        writeFileSync(testFile, '# Old Notes\n\nTo be deleted.');

        const result = await handleDeleteDoc(
          { path: 'research/old-notes.md', confirm: true },
          context
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse(result.content[0].text);
        expect(response.deleted).toBe(true);
        expect(response.pending).toBeFalsy();
        expect(response.trash).toBeDefined();
        expect(response.trash).toContain(TRASH_DIR);

        // Original file should be gone
        expect(existsSync(testFile)).toBe(false);

        // File should be in trash
        expect(existsSync(response.trash)).toBe(true);
      });

      it('preserves directory structure in trash', async () => {
        const testFile = join(testDir, 'examples', 'component.jsx');
        writeFileSync(testFile, 'export default function() {}');

        const result = await handleDeleteDoc(
          { path: 'examples/component.jsx', confirm: true },
          context
        );

        const response = JSON.parse(result.content[0].text);
        expect(response.trash).toContain(join(TRASH_DIR, 'examples'));
      });

      it('adds timestamp to trash filename', async () => {
        const testFile = join(testDir, 'research', 'temp.md');
        writeFileSync(testFile, '# Temp');

        const result = await handleDeleteDoc({ path: 'research/temp.md', confirm: true }, context);

        const response = JSON.parse(result.content[0].text);
        // Should have timestamp pattern: .deleted-YYYY-MM-DDTHH-MM-SS
        expect(response.trash).toMatch(/\.deleted-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
      });

      it('creates trash directory if missing', async () => {
        const trashDir = join(testDir, TRASH_DIR);
        expect(existsSync(trashDir)).toBe(false);

        const testFile = join(testDir, 'research', 'notes.md');
        writeFileSync(testFile, '# Notes');

        await handleDeleteDoc({ path: 'research/notes.md', confirm: true }, context);

        expect(existsSync(trashDir)).toBe(true);
      });
    });

    describe('backup', () => {
      it('creates backup before delete', async () => {
        const testFile = join(testDir, 'research', 'notes.md');
        writeFileSync(testFile, '# Important Notes');

        const result = await handleDeleteDoc({ path: 'research/notes.md', confirm: true }, context);

        const response = JSON.parse(result.content[0].text);
        expect(response.backup).toBeDefined();
        expect(existsSync(response.backup)).toBe(true);

        // Verify backup content
        const backupContent = readFileSync(response.backup, 'utf-8');
        expect(backupContent).toBe('# Important Notes');
      });

      it('creates backup even for permanent delete', async () => {
        const testFile = join(testDir, 'research', 'notes.md');
        writeFileSync(testFile, '# Notes');

        const result = await handleDeleteDoc(
          { path: 'research/notes.md', confirm: true, permanent: true },
          context
        );

        const response = JSON.parse(result.content[0].text);
        expect(response.backup).toBeDefined();
        expect(existsSync(response.backup)).toBe(true);
      });
    });

    describe('permanent delete', () => {
      it('permanently deletes file with permanent flag', async () => {
        const testFile = join(testDir, 'examples', 'temp.jsx');
        writeFileSync(testFile, '// Temp file');

        const result = await handleDeleteDoc(
          { path: 'examples/temp.jsx', confirm: true, permanent: true },
          context
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse(result.content[0].text);
        expect(response.deleted).toBe(true);
        expect(response.trash).toBeUndefined();

        // File should be gone
        expect(existsSync(testFile)).toBe(false);

        // Should not be in trash
        const trashDir = join(testDir, TRASH_DIR);
        if (existsSync(trashDir)) {
          const trashFiles = readdirSync(trashDir, { recursive: true });
          expect(trashFiles).not.toContain('temp.jsx');
        }
      });

      it('permanently deletes directory with permanent flag', async () => {
        const dirPath = join(testDir, 'examples', 'temp-dir');
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(join(dirPath, 'a.md'), '# Temp');

        const result = await handleDeleteDoc(
          { path: 'examples/temp-dir', confirm: true, permanent: true },
          context
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse(result.content[0].text);
        expect(response.deleted).toBe(true);
        expect(response.backup).toBe('');
        expect(existsSync(dirPath)).toBe(false);
      });
    });

    describe('protected files', () => {
      it('blocks deletion of VISION.md', async () => {
        const testFile = join(testDir, 'VISION.md');
        writeFileSync(testFile, '# Vision');

        const result = await handleDeleteDoc({ path: 'VISION.md', confirm: true }, context);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('protected');

        // File should still exist
        expect(existsSync(testFile)).toBe(true);
      });

      it('blocks deletion of all protected files', async () => {
        for (const protectedFile of PROTECTED_FILES) {
          const testFile = join(testDir, protectedFile);
          writeFileSync(testFile, `# ${protectedFile}`);

          const result = await handleDeleteDoc({ path: protectedFile, confirm: true }, context);

          expect(result.isError).toBe(true);
          expect(existsSync(testFile)).toBe(true);
        }
      });
    });

    describe('restricted paths', () => {
      it('blocks deletion of protected plan.md files', async () => {
        mkdirSync(join(testDir, 'plans', '0001-test'), { recursive: true });
        const testFile = join(testDir, 'plans', '0001-test', 'plan.md');
        writeFileSync(testFile, '# Plan');

        const result = await handleDeleteDoc(
          { path: 'plans/0001-test/plan.md', confirm: true },
          context
        );

        expect(result.isError).toBe(true);
        expect(existsSync(testFile)).toBe(true);
        const output = JSON.parse(result.content[0].text);
        expect(output.error).toContain('protected file');
      });

      it('allows deletion of non-plan.md files in plans directory', async () => {
        mkdirSync(join(testDir, 'plans', '0002-test'), { recursive: true });
        const testFile = join(testDir, 'plans', '0002-test', 'README.md');
        writeFileSync(testFile, '# README');

        const result = await handleDeleteDoc(
          { path: 'plans/0002-test/README.md', confirm: true },
          context
        );

        expect(result.isError).toBeUndefined();
        expect(existsSync(testFile)).toBe(false);
      });

      it('blocks deletion from .cursor directory', async () => {
        mkdirSync(join(testDir, '.cursor'), { recursive: true });
        const testFile = join(testDir, '.cursor', 'settings.json');
        writeFileSync(testFile, '{}');

        const result = await handleDeleteDoc(
          { path: '.cursor/settings.json', confirm: true },
          context
        );

        expect(result.isError).toBe(true);
        expect(existsSync(testFile)).toBe(true);
      });
    });

    describe('error handling', () => {
      it('returns error for non-existent file', async () => {
        const result = await handleDeleteDoc({ path: 'research/nonexistent.md' }, context);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not found');
      });

      it('returns error for path traversal', async () => {
        const result = await handleDeleteDoc({ path: '../../../etc/passwd' }, context);

        expect(result.isError).toBe(true);
      });
    });

    describe('index removal', () => {
      it('removes file from search index [index-delete]', async () => {
        const testFile = join(testDir, 'research', 'indexed.md');
        writeFileSync(testFile, '# Indexed Document\n\nSearchable content.');

        // Index the document first
        db.prepare(
          `
          INSERT INTO documents (path, title, content, modified_at, hash)
          VALUES (?, ?, ?, ?, ?)
        `
        ).run(
          testFile,
          'Indexed Document',
          '# Indexed Document\n\nSearchable content.',
          Date.now(),
          'hash123'
        );

        db.prepare(
          `
          INSERT INTO documents_fts (path, title, content)
          VALUES (?, ?, ?)
        `
        ).run(testFile, 'Indexed Document', '# Indexed Document\n\nSearchable content.');

        // Verify it's indexed
        const beforeDelete = db.prepare('SELECT * FROM documents WHERE path = ?').get(testFile);
        expect(beforeDelete).toBeDefined();

        // Delete the document
        await handleDeleteDoc({ path: 'research/indexed.md', confirm: true }, context);

        // Verify it's removed from index
        const afterDelete = db.prepare('SELECT * FROM documents WHERE path = ?').get(testFile);
        expect(afterDelete).toBeUndefined();

        const ftsAfterDelete = db
          .prepare('SELECT * FROM documents_fts WHERE path = ?')
          .get(testFile);
        expect(ftsAfterDelete).toBeUndefined();
      });
    });
  });

  describe('PROTECTED_FILES', () => {
    it('includes core documentation files', () => {
      expect(PROTECTED_FILES).toContain('VISION.md');
      expect(PROTECTED_FILES).toContain('RUNI-DESIGN-VISION.md');
      expect(PROTECTED_FILES).toContain('DESIGN_IDEOLOGY.md');
      expect(PROTECTED_FILES).toContain('MANIFEST.md');
      expect(PROTECTED_FILES).toContain('CLAUDE.md');
      expect(PROTECTED_FILES).toContain('README.md');
    });
  });

  describe('TRASH_DIR', () => {
    it('is .trash', () => {
      expect(TRASH_DIR).toBe('.trash');
    });
  });
});
