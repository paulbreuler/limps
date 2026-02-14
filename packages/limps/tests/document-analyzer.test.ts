import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createGraphSchema } from '../src/graph/schema.js';
import { extractReferences, DocumentAnalyzer } from '../src/analysis/document-analyzer.js';

describe('extractReferences', () => {
  it('should extract markdown links', () => {
    const content = 'See [the plan](./plans/0042-plan.md) for details.';
    const refs = extractReferences(content, '/project/docs/readme.md');

    expect(refs.length).toBe(1);
    expect(refs[0]!.type).toBe('markdown-link');
    expect(refs[0]!.target).toBe('/project/docs/plans/0042-plan.md');
    expect(refs[0]!.confidence).toBe(0.9);
    expect(refs[0]!.line).toBe(1);
  });

  it('should skip external URLs in markdown links', () => {
    const content = 'Visit [site](https://example.com) and [local](./file.md).';
    const refs = extractReferences(content, '/project/docs/readme.md');

    expect(refs.length).toBe(1);
    expect(refs[0]!.type).toBe('markdown-link');
    expect(refs[0]!.target).toContain('file.md');
  });

  it('should skip anchor-only links', () => {
    const content = 'Jump to [section](#overview).';
    const refs = extractReferences(content, '/project/docs/readme.md');
    expect(refs.length).toBe(0);
  });

  it('should extract wikilinks', () => {
    const content = 'Reference [[Daily Note]] and [[Project Plan|my plan]].';
    const refs = extractReferences(content, '/vault/notes/index.md');

    expect(refs.length).toBe(2);
    expect(refs[0]!.type).toBe('wikilink');
    expect(refs[0]!.target).toBe('Daily Note');
    expect(refs[0]!.confidence).toBe(0.85);

    expect(refs[1]!.type).toBe('wikilink');
    expect(refs[1]!.target).toBe('Project Plan');
  });

  it('should extract code imports', () => {
    const content = [
      "import { foo } from './utils/helper.js';",
      "import bar from '../lib/bar';",
      "const baz = require('./baz');",
      "import lodash from 'lodash';", // bare specifier, should be skipped
    ].join('\n');

    const refs = extractReferences(content, '/project/src/index.ts');

    expect(refs.length).toBe(3);
    expect(refs.every((r) => r.type === 'code-import')).toBe(true);
    expect(refs[0]!.target).toBe('/project/src/utils/helper.js');
    expect(refs[1]!.target).toBe('/project/lib/bar');
    expect(refs[2]!.target).toBe('/project/src/baz');
    expect(refs[0]!.confidence).toBe(0.95);
  });

  it('should extract file path mentions in backticks', () => {
    const content = 'Update `src/config.ts` and check `lib/utils.json`.';
    const refs = extractReferences(content, '/project/docs/readme.md');

    expect(refs.length).toBe(2);
    expect(refs.every((r) => r.type === 'file-mention')).toBe(true);
    expect(refs[0]!.target).toBe('/project/docs/src/config.ts');
    expect(refs[1]!.target).toBe('/project/docs/lib/utils.json');
    expect(refs[0]!.confidence).toBe(0.7);
  });

  it('should track line numbers correctly', () => {
    const content = ['# Title', '', 'See [[Target One]].', '', 'And [link](./other.md).'].join(
      '\n'
    );

    const refs = extractReferences(content, '/project/doc.md');

    expect(refs.length).toBe(2);
    // Markdown links are extracted first by regex iteration order, then wikilinks
    const mdLink = refs.find((r) => r.type === 'markdown-link');
    const wikiLink = refs.find((r) => r.type === 'wikilink');
    expect(mdLink).toBeDefined();
    expect(wikiLink).toBeDefined();
    expect(mdLink!.line).toBe(5); // markdown link on line 5
    expect(wikiLink!.line).toBe(3); // wikilink on line 3
  });

  it('should return empty array for content with no references', () => {
    const content = '# Just a title\n\nNo links here.';
    const refs = extractReferences(content, '/project/doc.md');
    expect(refs.length).toBe(0);
  });

  it('should handle mixed reference types', () => {
    const content = [
      'See [plan](./plan.md) and [[wiki link]].',
      "import { x } from './module.js';",
      'Check `src/main.ts`.',
    ].join('\n');

    const refs = extractReferences(content, '/project/src/doc.md');

    const types = refs.map((r) => r.type);
    expect(types).toContain('markdown-link');
    expect(types).toContain('wikilink');
    expect(types).toContain('code-import');
    expect(types).toContain('file-mention');
  });
});

describe('DocumentAnalyzer', () => {
  let dbPath: string;
  let db: DatabaseType | null = null;
  let testDir: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-analyzer-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-analyzer-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    db = new Database(dbPath);
    createGraphSchema(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should analyze a document and store references as graph relations', () => {
    const docPath = join(testDir, 'readme.md');
    const targetPath = join(testDir, 'plan.md');
    writeFileSync(docPath, 'See [the plan](./plan.md) for details.', 'utf-8');
    writeFileSync(targetPath, '# Plan', 'utf-8');

    const analyzer = new DocumentAnalyzer(db!);
    const result = analyzer.analyzeDocument(docPath, testDir);

    expect(result.references.length).toBe(1);
    expect(result.entityId).not.toBeNull();

    // Verify graph relation was stored
    const rels = db!.prepare('SELECT * FROM relationships').all();
    expect(rels.length).toBeGreaterThan(0);
  });

  it('should skip unchanged documents on re-analysis', () => {
    const docPath = join(testDir, 'doc.md');
    writeFileSync(docPath, 'See [[Other Doc]].', 'utf-8');

    const analyzer = new DocumentAnalyzer(db!);
    const result1 = analyzer.analyzeDocument(docPath, testDir);
    expect(result1.references.length).toBe(1);

    // Re-analyze same content
    const result2 = analyzer.analyzeDocument(docPath, testDir);
    expect(result2.references.length).toBe(0); // skipped (no change)
    expect(result2.entityId).not.toBeNull();
  });

  it('should analyze multiple documents in batch', () => {
    const doc1 = join(testDir, 'a.md');
    const doc2 = join(testDir, 'b.md');
    const doc3 = join(testDir, 'c.md');
    writeFileSync(doc1, 'Link to [b](./b.md).', 'utf-8');
    writeFileSync(doc2, 'Link to [[c]].', 'utf-8');
    writeFileSync(doc3, '# No refs', 'utf-8');

    const analyzer = new DocumentAnalyzer(db!);
    const result = analyzer.analyzeDocuments([doc1, doc2, doc3], testDir);

    expect(result.analyzed).toBe(2);
    expect(result.skipped).toBe(1); // c.md has no refs
    expect(result.totalReferences).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it('should handle non-existent files gracefully', () => {
    const analyzer = new DocumentAnalyzer(db!);
    const result = analyzer.analyzeDocument('/nonexistent/file.md');

    expect(result.references.length).toBe(0);
    expect(result.entityId).toBeNull();
  });

  it('should store code imports as MODIFIES relations', () => {
    const docPath = join(testDir, 'module.ts');
    writeFileSync(docPath, "import { foo } from './helper.js';", 'utf-8');

    const analyzer = new DocumentAnalyzer(db!);
    analyzer.analyzeDocument(docPath, testDir);

    const rels = db!
      .prepare("SELECT * FROM relationships WHERE relation_type = 'MODIFIES'")
      .all() as { relation_type: string }[];
    expect(rels.length).toBe(1);
  });

  it('should store markdown links and wikilinks as REFERENCES relations', () => {
    const docPath = join(testDir, 'doc.md');
    writeFileSync(docPath, 'See [plan](./plan.md) and [[wiki]].', 'utf-8');

    const analyzer = new DocumentAnalyzer(db!);
    analyzer.analyzeDocument(docPath, testDir);

    const rels = db!
      .prepare("SELECT * FROM relationships WHERE relation_type = 'REFERENCES'")
      .all() as { relation_type: string }[];
    expect(rels.length).toBe(2);
  });
});
