import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseFrontmatter } from '../../src/graph/parser.js';
import { EntityExtractor } from '../../src/graph/extractor.js';

describe('graph parser', () => {
  it('parses frontmatter fields including arrays', () => {
    const parsed = parseFrontmatter(`---
title: Dependency-Based Entity Extraction
status: GAP
persona: coder
depends_on: [000, "001"]
files: [src/graph/extractor.ts, "src/graph/parser.ts"]
tags: [extraction, nlp]
---

# Agent 001
`);

    expect(parsed.title).toBe('Dependency-Based Entity Extraction');
    expect(parsed.status).toBe('GAP');
    expect(parsed.persona).toBe('coder');
    expect(parsed.depends).toEqual(['000', '001']);
    expect(parsed.files).toEqual(['src/graph/extractor.ts', 'src/graph/parser.ts']);
    expect(parsed.tags).toEqual(['extraction', 'nlp']);
  });

  it('handles malformed or missing frontmatter gracefully', () => {
    const malformed = parseFrontmatter(`---
title: Broken
status: GAP
# missing closing fence`);
    const missing = parseFrontmatter('# No frontmatter');

    expect(malformed).toEqual({});
    expect(missing).toEqual({});
  });
});

describe('entity extractor', () => {
  it('extracts plan, agent, feature, file, and tag entities and key relationships', () => {
    const root = mkdtempSync(join(tmpdir(), 'limps-graph-extract-'));
    const planDir = join(root, '0042-Knowledge Graph Foundation');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    try {
      writeFileSync(
        join(planDir, '0042-Knowledge Graph Foundation-plan.md'),
        `---
title: Knowledge Graph Foundation
status: draft
tags: [knowledge-graph, hybrid-retrieval]
---

# Knowledge Graph Foundation

### #1: Entity Schema & Graph Storage
Status: \`GAP\`

### #2: Entity Resolution & Similarity Detection
Status: \`GAP\`
`,
        'utf8'
      );

      writeFileSync(
        join(agentsDir, '000-entity-schema-storage.agent.md'),
        `---
title: Entity Schema & Storage
status: PASS
depends_on: []
files: [src/graph/schema.ts, src/graph/storage.ts]
tags: [foundation, sqlite]
---

# Agent 000: Entity Schema & Storage
`,
        'utf8'
      );

      writeFileSync(
        join(agentsDir, '001-entity-resolution.agent.md'),
        `---
title: Dependency-Based Entity Extraction
status: GAP
depends_on: [000]
files: [src/graph/extractor.ts, src/graph/patterns.ts, src/graph/parser.ts]
tags: [extraction, nlp]
---

# Agent 001: Dependency-Based Entity Extraction

This agent depends on agent 0042#000.
Also references plan 0041 for comparison.
Inline file mention: \`src/graph/extractor.ts\`
Inline tag mention: #deterministic
`,
        'utf8'
      );

      const extractor = new EntityExtractor();
      const result = extractor.extractPlan(planDir);

      const entityTypes = new Set(result.entities.map((e) => e.type));
      expect(entityTypes.has('plan')).toBe(true);
      expect(entityTypes.has('agent')).toBe(true);
      expect(entityTypes.has('feature')).toBe(true);
      expect(entityTypes.has('file')).toBe(true);
      expect(entityTypes.has('tag')).toBe(true);

      const relationTypes = new Set(result.relationships.map((r) => r.relationType));
      expect(relationTypes.has('CONTAINS')).toBe(true);
      expect(relationTypes.has('DEPENDS_ON')).toBe(true);
      expect(relationTypes.has('MODIFIES')).toBe(true);

      expect(
        result.entities.some((e) => e.canonicalId === 'agent:0042#001' && e.type === 'agent')
      ).toBe(true);
      expect(
        result.entities.some(
          (e) => e.canonicalId === 'file:src/graph/extractor.ts' && e.type === 'file'
        )
      ).toBe(true);
      expect(
        result.entities.some((e) => e.canonicalId === 'tag:deterministic' && e.type === 'tag')
      ).toBe(true);

      expect(result.warnings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
