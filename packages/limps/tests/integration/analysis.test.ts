import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { extractReferences, DocumentAnalyzer } from '../../src/analysis/document-analyzer.js';
import { computePageRank, LinkAnalyzer } from '../../src/analysis/link-analysis.js';
import { extractConcepts } from '../../src/analysis/concept-extractor.js';
import { discoverRelationships } from '../../src/analysis/relationship-discoverer.js';
import { GraphStorage } from '../../src/graph/storage.js';
import type { Entity } from '../../src/graph/types.js';

/**
 * Integration tests for document analysis pipeline:
 * - DocumentAnalyzer reference extraction
 * - LinkAnalyzer PageRank computation
 * - Concept extraction
 * - Relationship discovery with Jaccard similarity
 */
describe('analysis', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-analysis-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-analysis-dir-${Date.now()}`);
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

  describe('DocumentAnalyzer - reference extraction', () => {
    it('should extract markdown links', () => {
      const content = 'See [the plan](./plan.md) for details.';
      const refs = extractReferences(content, join(testDir, 'doc.md'));

      expect(refs.length).toBe(1);
      expect(refs[0]!.type).toBe('markdown-link');
      expect(refs[0]!.target).toBe(join(testDir, 'plan.md'));
      expect(refs[0]!.confidence).toBe(0.9);
      expect(refs[0]!.line).toBe(1);
    });

    it('should extract wikilinks', () => {
      const content = 'Related to [[Architecture]] and [[Design|Designs]].';
      const refs = extractReferences(content, join(testDir, 'doc.md'));

      const wikilinks = refs.filter((r) => r.type === 'wikilink');
      expect(wikilinks.length).toBe(2);
      expect(wikilinks[0]!.target).toBe('Architecture');
      expect(wikilinks[1]!.target).toBe('Design');
      expect(wikilinks[0]!.confidence).toBe(0.85);
    });

    it('should extract code imports', () => {
      const content = `import { foo } from './utils.js';\nconst bar = require('./helpers.js');`;
      const refs = extractReferences(content, join(testDir, 'index.ts'));

      const imports = refs.filter((r) => r.type === 'code-import');
      expect(imports.length).toBe(2);
      expect(imports[0]!.target).toBe(join(testDir, 'utils.js'));
      expect(imports[1]!.target).toBe(join(testDir, 'helpers.js'));
      expect(imports[0]!.confidence).toBe(0.95);
    });

    it('should extract file mentions in backticks', () => {
      const content = 'Check `src/config.ts` for configuration.';
      const refs = extractReferences(content, join(testDir, 'readme.md'));

      const mentions = refs.filter((r) => r.type === 'file-mention');
      expect(mentions.length).toBe(1);
      expect(mentions[0]!.confidence).toBe(0.7);
    });

    it('should skip external URLs', () => {
      const content = 'See [docs](https://example.com/docs) for info.';
      const refs = extractReferences(content, join(testDir, 'doc.md'));
      expect(refs.length).toBe(0);
    });

    it('should skip anchor-only links', () => {
      const content = 'Jump to [section](#overview).';
      const refs = extractReferences(content, join(testDir, 'doc.md'));
      expect(refs.length).toBe(0);
    });

    it('should skip bare specifier imports (node_modules)', () => {
      const content = `import express from 'express';`;
      const refs = extractReferences(content, join(testDir, 'app.ts'));
      expect(refs.length).toBe(0);
    });

    it('should handle all reference types in a single document', () => {
      const content = [
        '# Plan',
        'See [overview](./overview.md) for context.',
        'Related: [[Architecture]]',
        `import { helper } from './helper.js';`,
        'Check `src/config.ts` for details.',
      ].join('\n');

      const refs = extractReferences(content, join(testDir, 'plan.md'));

      const types = new Set(refs.map((r) => r.type));
      expect(types.has('markdown-link')).toBe(true);
      expect(types.has('wikilink')).toBe(true);
      expect(types.has('code-import')).toBe(true);
      expect(types.has('file-mention')).toBe(true);
    });
  });

  describe('DocumentAnalyzer - graph storage integration', () => {
    it('should analyze a document and store entities/relations', () => {
      const docPath = join(testDir, 'source.md');
      const targetPath = join(testDir, 'target.md');
      writeFileSync(docPath, 'See [target](./target.md) for details.', 'utf-8');
      writeFileSync(targetPath, '# Target', 'utf-8');

      const analyzer = new DocumentAnalyzer(db!);
      const result = analyzer.analyzeDocument(docPath, testDir);

      expect(result.entityId).not.toBeNull();
      expect(result.references.length).toBe(1);

      // Verify entities stored
      const storage = new GraphStorage(db!);
      const entities = storage.getAllEntities();
      expect(entities.length).toBe(2); // source + target
    });

    it('should skip re-analysis when content unchanged', () => {
      const docPath = join(testDir, 'unchanged.md');
      writeFileSync(docPath, 'See [other](./other.md) for info.', 'utf-8');

      const analyzer = new DocumentAnalyzer(db!);
      const first = analyzer.analyzeDocument(docPath, testDir);
      expect(first.references.length).toBe(1);

      const second = analyzer.analyzeDocument(docPath, testDir);
      expect(second.references.length).toBe(0); // skipped, no new refs
      expect(second.entityId).toBe(first.entityId);
    });

    it('should return empty result for non-existent file', () => {
      const analyzer = new DocumentAnalyzer(db!);
      const result = analyzer.analyzeDocument('/nonexistent/file.md', testDir);
      expect(result.entityId).toBeNull();
      expect(result.references.length).toBe(0);
    });
  });

  describe('LinkAnalyzer - PageRank', () => {
    it('should compute PageRank with empty graph', () => {
      const scores = computePageRank([], []);
      expect(scores.size).toBe(0);
    });

    it('should give higher score to frequently referenced nodes', () => {
      const storage = new GraphStorage(db!);

      // Create hub entity that is referenced by many others
      const hub = storage.upsertEntity({
        type: 'file',
        canonicalId: 'file:hub.md',
        name: 'hub.md',
        metadata: {},
      });

      const sources: Entity[] = [];
      for (let i = 0; i < 5; i++) {
        const src = storage.upsertEntity({
          type: 'file',
          canonicalId: `file:src-${i}.md`,
          name: `src-${i}.md`,
          metadata: {},
        });
        sources.push(src);

        storage.upsertRelationship({
          sourceId: src.id,
          targetId: hub.id,
          relationType: 'REFERENCES',
          confidence: 0.9,
          metadata: {},
        });
      }

      const analyzer = new LinkAnalyzer(db!);
      const result = analyzer.findHubDocuments(3);

      expect(result.totalDocuments).toBe(6); // hub + 5 sources
      expect(result.totalReferences).toBe(5);
      expect(result.hubs.length).toBeGreaterThanOrEqual(1);
      expect(result.hubs[0]!.entityId).toBe('file:hub.md');
      expect(result.hubs[0]!.inDegree).toBe(5);
    });

    it('should compute full PageRank across all relationship types', () => {
      const storage = new GraphStorage(db!);

      const a = storage.upsertEntity({
        type: 'file',
        canonicalId: 'file:a.md',
        name: 'a.md',
        metadata: {},
      });
      const b = storage.upsertEntity({
        type: 'file',
        canonicalId: 'file:b.md',
        name: 'b.md',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: a.id,
        targetId: b.id,
        relationType: 'MODIFIES',
        confidence: 0.95,
        metadata: {},
      });

      const analyzer = new LinkAnalyzer(db!);
      const fullRanks = analyzer.computeFullPageRank();

      expect(fullRanks.size).toBe(2);
      // b should rank higher since it's the target
      expect(fullRanks.get('file:b.md')!).toBeGreaterThan(fullRanks.get('file:a.md')!);
    });
  });

  describe('concept extraction', () => {
    it('should extract concepts from headings', () => {
      const content = '## Authentication Flow\n### Token Validation\nSome text.';
      const concepts = extractConcepts(content);

      const names = concepts.map((c) => c.name);
      expect(names).toContain('Authentication Flow');
      expect(names).toContain('Token Validation');
    });

    it('should extract code block languages', () => {
      const content = '```typescript\nconst x = 1;\n```\n```python\nprint("hi")\n```';
      const concepts = extractConcepts(content);

      const codeBlocks = concepts.filter((c) => c.source === 'code_block');
      const names = codeBlocks.map((c) => c.name);
      expect(names).toContain('typescript');
      expect(names).toContain('python');
    });

    it('should extract technical terms (PascalCase)', () => {
      const content = 'The DocumentAnalyzer processes files. Use DocumentAnalyzer for extraction.';
      const concepts = extractConcepts(content);

      const found = concepts.find(
        (c) => c.name === 'DocumentAnalyzer' && c.source === 'technical_term'
      );
      expect(found).toBeDefined();
      expect(found!.frequency).toBeGreaterThanOrEqual(2);
    });

    it('should filter by minimum frequency', () => {
      const content = 'The PageRank algorithm. PageRank is important. Also LinkAnalyzer.';
      const concepts = extractConcepts(content, 2);

      // PageRank appears twice, LinkAnalyzer once
      const names = concepts.map((c) => c.name);
      expect(names).toContain('PageRank');
      expect(names).not.toContain('LinkAnalyzer');
    });

    it('should filter out stop words from inline code', () => {
      const content = 'Use `the` and `DocumentAnalyzer` here.';
      const concepts = extractConcepts(content);

      const names = concepts.map((c) => c.name.toLowerCase());
      expect(names).not.toContain('the');
    });
  });

  describe('relationship discovery', () => {
    it('should discover relationships via shared tags', () => {
      const storage = new GraphStorage(db!);

      const agent1 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#001',
        name: 'Agent 001',
        metadata: {},
      });
      const agent2 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#002',
        name: 'Agent 002',
        metadata: {},
      });

      // Create shared tags
      const tag1 = storage.upsertEntity({
        type: 'tag',
        canonicalId: 'tag:auth',
        name: 'auth',
        metadata: {},
      });
      const tag2 = storage.upsertEntity({
        type: 'tag',
        canonicalId: 'tag:security',
        name: 'security',
        metadata: {},
      });

      // Both agents tagged with auth and security
      storage.upsertRelationship({
        sourceId: agent1.id,
        targetId: tag1.id,
        relationType: 'TAGGED_WITH',
        confidence: 1.0,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: agent1.id,
        targetId: tag2.id,
        relationType: 'TAGGED_WITH',
        confidence: 1.0,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: agent2.id,
        targetId: tag1.id,
        relationType: 'TAGGED_WITH',
        confidence: 1.0,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: agent2.id,
        targetId: tag2.id,
        relationType: 'TAGGED_WITH',
        confidence: 1.0,
        metadata: {},
      });

      const result = discoverRelationships(db!, { minConfidence: 0.1 });

      expect(result.relationships.length).toBeGreaterThanOrEqual(1);
      const rel = result.relationships[0]!;
      expect(rel.confidence).toBeGreaterThan(0);
      expect(rel.reason).toContain('tag overlap');
    });

    it('should discover relationships via shared file modifications', () => {
      const storage = new GraphStorage(db!);

      const agent1 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0002#001',
        name: 'Agent A',
        metadata: {},
      });
      const agent2 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0002#002',
        name: 'Agent B',
        metadata: {},
      });

      const file = storage.upsertEntity({
        type: 'file',
        canonicalId: 'file:shared.ts',
        name: 'shared.ts',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: agent1.id,
        targetId: file.id,
        relationType: 'MODIFIES',
        confidence: 1.0,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: agent2.id,
        targetId: file.id,
        relationType: 'MODIFIES',
        confidence: 1.0,
        metadata: {},
      });

      const result = discoverRelationships(db!, { minConfidence: 0.1 });

      expect(result.relationships.length).toBeGreaterThanOrEqual(1);
      expect(result.relationships[0]!.reason).toContain('file overlap');
    });

    it('should respect minConfidence threshold', () => {
      const storage = new GraphStorage(db!);

      const agent1 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0003#001',
        name: 'Agent X',
        metadata: {},
      });
      const agent2 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0003#002',
        name: 'Agent Y',
        metadata: {},
      });

      // Only one shared tag out of many => low Jaccard similarity
      const sharedTag = storage.upsertEntity({
        type: 'tag',
        canonicalId: 'tag:shared',
        name: 'shared',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: agent1.id,
        targetId: sharedTag.id,
        relationType: 'TAGGED_WITH',
        confidence: 1.0,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: agent2.id,
        targetId: sharedTag.id,
        relationType: 'TAGGED_WITH',
        confidence: 1.0,
        metadata: {},
      });

      // Add unique tags to agent1 to lower Jaccard
      for (let i = 0; i < 10; i++) {
        const tag = storage.upsertEntity({
          type: 'tag',
          canonicalId: `tag:unique-${i}`,
          name: `unique-${i}`,
          metadata: {},
        });
        storage.upsertRelationship({
          sourceId: agent1.id,
          targetId: tag.id,
          relationType: 'TAGGED_WITH',
          confidence: 1.0,
          metadata: {},
        });
      }

      // High threshold should filter out the weak relationship
      const highThreshold = discoverRelationships(db!, { minConfidence: 0.8 });
      expect(highThreshold.relationships.length).toBe(0);

      // Low threshold should find it
      const lowThreshold = discoverRelationships(db!, { minConfidence: 0.01 });
      expect(lowThreshold.relationships.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty results for no entities', () => {
      const result = discoverRelationships(db!);
      expect(result.relationships.length).toBe(0);
    });
  });
});
