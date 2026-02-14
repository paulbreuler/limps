import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { extractConcepts } from '../src/analysis/concept-extractor.js';
import { discoverRelationships } from '../src/analysis/relationship-discoverer.js';
import { jaccardSimilarity, ConflictDetector } from '../src/graph/conflict-detector.js';
import { GraphStorage } from '../src/graph/storage.js';

function createGraphDb(): DatabaseType {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      canonical_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source_path TEXT,
      content_hash TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(type, canonical_id)
    );
    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(source_id, target_id, relation_type)
    );
    CREATE TABLE IF NOT EXISTS graph_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
      name,
      metadata
    );
  `);
  return db;
}

let db: DatabaseType;

beforeEach(() => {
  db = createGraphDb();
});

afterEach(() => {
  db.close();
});

describe('extractConcepts', () => {
  it('extracts concepts from headings', () => {
    const content = `# Title
## Authentication Flow
### Token Validation
Some text here.
## Authentication Flow
More text.`;

    const concepts = extractConcepts(content);
    const names = concepts.map((c) => c.name);
    expect(names).toContain('Authentication Flow');
    expect(names).toContain('Token Validation');

    // Authentication Flow appears twice
    const authConcept = concepts.find((c) => c.name === 'Authentication Flow');
    expect(authConcept?.frequency).toBe(2);
    expect(authConcept?.source).toBe('heading');
  });

  it('extracts concepts from code blocks', () => {
    const content = `
Some text.
\`\`\`typescript
const foo = 1;
\`\`\`
\`\`\`python
print("hello")
\`\`\`
Reference \`GraphStorage\` here and also \`GraphStorage\` again.
`;
    const concepts = extractConcepts(content);
    const names = concepts.map((c) => c.name);
    expect(names).toContain('typescript');
    expect(names).toContain('python');
    expect(names).toContain('GraphStorage');

    const gs = concepts.find((c) => c.name === 'GraphStorage');
    expect(gs?.frequency).toBe(2);
  });

  it('extracts PascalCase technical terms', () => {
    const content = 'The EntityExtractor and ConflictDetector handle graph logic.';
    const concepts = extractConcepts(content);
    const names = concepts.map((c) => c.name);
    expect(names).toContain('EntityExtractor');
    expect(names).toContain('ConflictDetector');
  });

  it('respects minFrequency filter', () => {
    const content = `## Rare Heading
Some EntityExtractor EntityExtractor text.`;
    const concepts = extractConcepts(content, 2);
    const names = concepts.map((c) => c.name);
    expect(names).not.toContain('Rare Heading');
    expect(names).toContain('EntityExtractor');
  });
});

describe('jaccardSimilarity', () => {
  it('returns 0 for empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    expect(jaccardSimilarity(new Set([1, 2, 3]), new Set([1, 2, 3]))).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccardSimilarity(new Set([1, 2]), new Set([3, 4]))).toBe(0);
  });

  it('returns correct similarity for partial overlap', () => {
    const sim = jaccardSimilarity(new Set([1, 2, 3]), new Set([2, 3, 4]));
    // Intersection: {2, 3} = 2, Union: {1, 2, 3, 4} = 4
    expect(sim).toBeCloseTo(0.5);
  });
});

describe('ConflictDetector - new conflict types', () => {
  it('detects concept conflicts based on tag overlap', () => {
    const storage = new GraphStorage(db);

    // Create shared tag
    const tag = storage.upsertEntity({
      type: 'tag',
      canonicalId: 'tag:auth',
      name: 'auth',
      metadata: {},
    });

    // Create two concepts
    const conceptA = storage.upsertEntity({
      type: 'concept',
      canonicalId: 'concept:auth-flow',
      name: 'Authentication Flow',
      metadata: {},
    });
    const conceptB = storage.upsertEntity({
      type: 'concept',
      canonicalId: 'concept:login-flow',
      name: 'Login Flow',
      metadata: {},
    });

    // Both tagged with 'auth'
    storage.upsertRelationship({
      sourceId: conceptA.id,
      targetId: tag.id,
      relationType: 'TAGGED_WITH',
      confidence: 1,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: conceptB.id,
      targetId: tag.id,
      relationType: 'TAGGED_WITH',
      confidence: 1,
      metadata: {},
    });

    const detector = new ConflictDetector(storage, { conceptConflictThreshold: 0.5 });
    const conflicts = detector.detectConceptConflicts();

    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0]?.type).toBe('concept_conflict');
    expect(conflicts[0]?.entities).toContain('concept:auth-flow');
    expect(conflicts[0]?.entities).toContain('concept:login-flow');
  });

  it('detects duplicate content between features', () => {
    const storage = new GraphStorage(db);

    // Create shared tags and files
    const tag1 = storage.upsertEntity({
      type: 'tag',
      canonicalId: 'tag:api',
      name: 'api',
      metadata: {},
    });
    const file1 = storage.upsertEntity({
      type: 'file',
      canonicalId: 'file:api.ts',
      name: 'api.ts',
      metadata: {},
    });

    // Create two features sharing all tags and files
    const featureA = storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0001#1',
      name: 'API Endpoints',
      metadata: {},
    });
    const featureB = storage.upsertEntity({
      type: 'feature',
      canonicalId: 'feature:0002#1',
      name: 'REST API',
      metadata: {},
    });

    // Both share tag and file
    for (const feature of [featureA, featureB]) {
      storage.upsertRelationship({
        sourceId: feature.id,
        targetId: tag1.id,
        relationType: 'TAGGED_WITH',
        confidence: 1,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: feature.id,
        targetId: file1.id,
        relationType: 'MODIFIES',
        confidence: 1,
        metadata: {},
      });
    }

    const detector = new ConflictDetector(storage, { duplicateContentThreshold: 0.5 });
    const conflicts = detector.detectDuplicateContent();

    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0]?.type).toBe('duplicate_content');
  });

  it('includes new conflict types in detectAll', () => {
    const storage = new GraphStorage(db);
    const detector = new ConflictDetector(storage);
    // Should not throw even with empty DB
    const all = detector.detectAll();
    expect(Array.isArray(all)).toBe(true);
  });
});

describe('discoverRelationships', () => {
  it('discovers relationships based on shared tags', () => {
    const storage = new GraphStorage(db);

    // Create shared tag
    const tag = storage.upsertEntity({
      type: 'tag',
      canonicalId: 'tag:database',
      name: 'database',
      metadata: {},
    });

    // Create two agents sharing the tag
    const agentA = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#001',
      name: 'Schema Migration',
      metadata: {},
    });
    const agentB = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#002',
      name: 'Query Optimizer',
      metadata: {},
    });

    storage.upsertRelationship({
      sourceId: agentA.id,
      targetId: tag.id,
      relationType: 'TAGGED_WITH',
      confidence: 1,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: agentB.id,
      targetId: tag.id,
      relationType: 'TAGGED_WITH',
      confidence: 1,
      metadata: {},
    });

    const result = discoverRelationships(db, { minConfidence: 0.3 });
    expect(result.relationships.length).toBeGreaterThanOrEqual(1);

    const rel = result.relationships[0];
    expect(rel?.confidence).toBeGreaterThan(0);
    expect(rel?.reason).toContain('tag overlap');
  });

  it('discovers relationships based on shared files', () => {
    const storage = new GraphStorage(db);

    const file = storage.upsertEntity({
      type: 'file',
      canonicalId: 'file:src/index.ts',
      name: 'src/index.ts',
      metadata: {},
    });

    const agentA = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#001',
      name: 'Index Refactor',
      metadata: {},
    });
    const agentB = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0002#001',
      name: 'Export Cleanup',
      metadata: {},
    });

    storage.upsertRelationship({
      sourceId: agentA.id,
      targetId: file.id,
      relationType: 'MODIFIES',
      confidence: 1,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: agentB.id,
      targetId: file.id,
      relationType: 'MODIFIES',
      confidence: 1,
      metadata: {},
    });

    const result = discoverRelationships(db, { minConfidence: 0.3 });
    expect(result.relationships.length).toBeGreaterThanOrEqual(1);
    expect(result.relationships[0]?.reason).toContain('file overlap');
  });

  it('filters by planId', () => {
    const storage = new GraphStorage(db);

    const tag = storage.upsertEntity({
      type: 'tag',
      canonicalId: 'tag:test',
      name: 'test',
      metadata: {},
    });

    const agent1 = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#001',
      name: 'Agent A',
      metadata: {},
    });
    const agent2 = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0002#001',
      name: 'Agent B',
      metadata: {},
    });

    storage.upsertRelationship({
      sourceId: agent1.id,
      targetId: tag.id,
      relationType: 'TAGGED_WITH',
      confidence: 1,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: agent2.id,
      targetId: tag.id,
      relationType: 'TAGGED_WITH',
      confidence: 1,
      metadata: {},
    });

    // Filter to plan 0001 only - should exclude agent2
    const result = discoverRelationships(db, { planId: '0001', minConfidence: 0.1 });
    // Only one agent matches plan 0001, so no pair to compare
    expect(result.relationships).toHaveLength(0);
  });

  it('skips entities that already have direct relationships', () => {
    const storage = new GraphStorage(db);

    const tag = storage.upsertEntity({
      type: 'tag',
      canonicalId: 'tag:shared',
      name: 'shared',
      metadata: {},
    });

    const agentA = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#001',
      name: 'Agent A',
      metadata: {},
    });
    const agentB = storage.upsertEntity({
      type: 'agent',
      canonicalId: 'agent:0001#002',
      name: 'Agent B',
      metadata: {},
    });

    // Both share tag
    storage.upsertRelationship({
      sourceId: agentA.id,
      targetId: tag.id,
      relationType: 'TAGGED_WITH',
      confidence: 1,
      metadata: {},
    });
    storage.upsertRelationship({
      sourceId: agentB.id,
      targetId: tag.id,
      relationType: 'TAGGED_WITH',
      confidence: 1,
      metadata: {},
    });

    // They already have a direct relationship
    storage.upsertRelationship({
      sourceId: agentA.id,
      targetId: agentB.id,
      relationType: 'DEPENDS_ON',
      confidence: 1,
      metadata: {},
    });

    const result = discoverRelationships(db, { minConfidence: 0.1 });
    // Should not suggest a relationship between A and B
    const hasAB = result.relationships.some(
      (r) =>
        (r.sourceId === 'agent:0001#001' && r.targetId === 'agent:0001#002') ||
        (r.sourceId === 'agent:0001#002' && r.targetId === 'agent:0001#001')
    );
    expect(hasAB).toBe(false);
  });

  it('returns empty for empty graph', () => {
    const result = discoverRelationships(db);
    expect(result.relationships).toHaveLength(0);
  });
});
