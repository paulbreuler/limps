import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createGraphSchema } from '../../src/graph/schema.js';
import { GraphStorage } from '../../src/graph/storage.js';
import { ConflictDetector } from '../../src/graph/conflict-detector.js';

describe('ConflictDetector', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let storage: GraphStorage;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-conflict-${Date.now()}.sqlite`);
    db = new Database(dbPath);
    createGraphSchema(db);
    storage = new GraphStorage(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe('detectFileContention', () => {
    it('detects when multiple WIP agents modify the same file', () => {
      const agent1 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#001',
        name: 'Agent 001',
        metadata: { status: 'WIP' },
      });
      const agent2 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#002',
        name: 'Agent 002',
        metadata: { status: 'WIP' },
      });
      const file = storage.upsertEntity({
        type: 'file',
        canonicalId: 'file:src/foo.ts',
        name: 'src/foo.ts',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: agent1.id,
        targetId: file.id,
        relationType: 'MODIFIES',
        confidence: 1,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: agent2.id,
        targetId: file.id,
        relationType: 'MODIFIES',
        confidence: 1,
        metadata: {},
      });

      const detector = new ConflictDetector(storage);
      const reports = detector.detectFileContention();

      expect(reports).toHaveLength(1);
      expect(reports[0]?.type).toBe('file_contention');
      expect(reports[0]?.severity).toBe('error');
    });

    it('does not flag non-WIP agents', () => {
      const agent1 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#001',
        name: 'Agent 001',
        metadata: { status: 'PASS' },
      });
      const agent2 = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#002',
        name: 'Agent 002',
        metadata: { status: 'WIP' },
      });
      const file = storage.upsertEntity({
        type: 'file',
        canonicalId: 'file:src/bar.ts',
        name: 'src/bar.ts',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: agent1.id,
        targetId: file.id,
        relationType: 'MODIFIES',
        confidence: 1,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: agent2.id,
        targetId: file.id,
        relationType: 'MODIFIES',
        confidence: 1,
        metadata: {},
      });

      const detector = new ConflictDetector(storage);
      const reports = detector.detectFileContention();

      expect(reports).toHaveLength(0);
    });
  });

  describe('detectFeatureOverlap', () => {
    it('reports high-confidence SIMILAR_TO relationships', () => {
      const f1 = storage.upsertEntity({
        type: 'feature',
        canonicalId: 'feature:0001#1',
        name: 'Auth Login',
        metadata: {},
      });
      const f2 = storage.upsertEntity({
        type: 'feature',
        canonicalId: 'feature:0002#1',
        name: 'Auth Login v2',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: f1.id,
        targetId: f2.id,
        relationType: 'SIMILAR_TO',
        confidence: 0.9,
        metadata: {},
      });

      const detector = new ConflictDetector(storage);
      const reports = detector.detectFeatureOverlap();

      expect(reports).toHaveLength(1);
      expect(reports[0]?.severity).toBe('warning');
    });

    it('ignores low-confidence similarities', () => {
      const f1 = storage.upsertEntity({
        type: 'feature',
        canonicalId: 'feature:0001#1',
        name: 'Auth',
        metadata: {},
      });
      const f2 = storage.upsertEntity({
        type: 'feature',
        canonicalId: 'feature:0002#1',
        name: 'Logging',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: f1.id,
        targetId: f2.id,
        relationType: 'SIMILAR_TO',
        confidence: 0.5,
        metadata: {},
      });

      const detector = new ConflictDetector(storage);
      const reports = detector.detectFeatureOverlap();

      expect(reports).toHaveLength(0);
    });
  });

  describe('detectCircularDependencies', () => {
    it('detects a cycle in DEPENDS_ON graph', () => {
      const a = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#001',
        name: 'A',
        metadata: {},
      });
      const b = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#002',
        name: 'B',
        metadata: {},
      });
      const c = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#003',
        name: 'C',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: a.id,
        targetId: b.id,
        relationType: 'DEPENDS_ON',
        confidence: 1,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: b.id,
        targetId: c.id,
        relationType: 'DEPENDS_ON',
        confidence: 1,
        metadata: {},
      });
      storage.upsertRelationship({
        sourceId: c.id,
        targetId: a.id,
        relationType: 'DEPENDS_ON',
        confidence: 1,
        metadata: {},
      });

      const detector = new ConflictDetector(storage);
      const reports = detector.detectCircularDependencies();

      expect(reports.length).toBeGreaterThanOrEqual(1);
      expect(reports[0]?.type).toBe('circular_dependency');
      expect(reports[0]?.severity).toBe('error');
    });

    it('returns empty for acyclic graph', () => {
      const a = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#001',
        name: 'A',
        metadata: {},
      });
      const b = storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#002',
        name: 'B',
        metadata: {},
      });

      storage.upsertRelationship({
        sourceId: a.id,
        targetId: b.id,
        relationType: 'DEPENDS_ON',
        confidence: 1,
        metadata: {},
      });

      const detector = new ConflictDetector(storage);
      const reports = detector.detectCircularDependencies();

      expect(reports).toHaveLength(0);
    });
  });

  describe('detectStaleWip', () => {
    it('detects stale WIP agents', () => {
      const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

      // Create an agent entity and manually update its updated_at
      storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#001',
        name: 'Stale Agent',
        metadata: { status: 'WIP' },
      });

      // Manually update the timestamp
      db!
        .prepare("UPDATE entities SET updated_at = ? WHERE canonical_id = 'agent:0001#001'")
        .run(staleDate);

      const detector = new ConflictDetector(storage);
      const reports = detector.detectStaleWip();

      expect(reports).toHaveLength(1);
      expect(reports[0]?.type).toBe('stale_wip');
      expect(reports[0]?.severity).toBe('warning');
    });

    it('does not flag recent WIP agents', () => {
      storage.upsertEntity({
        type: 'agent',
        canonicalId: 'agent:0001#001',
        name: 'Active Agent',
        metadata: { status: 'WIP' },
      });

      const detector = new ConflictDetector(storage);
      const reports = detector.detectStaleWip();

      expect(reports).toHaveLength(0);
    });
  });

  describe('detectAll', () => {
    it('combines all detection methods', () => {
      const detector = new ConflictDetector(storage);
      const reports = detector.detectAll();
      expect(Array.isArray(reports)).toBe(true);
    });
  });
});
