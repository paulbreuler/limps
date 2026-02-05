import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseFrontmatter } from '../../src/graph/parser.js';
import { EntityExtractor } from '../../src/graph/extractor.js';
import { PATTERNS } from '../../src/graph/patterns.js';

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

  it('parses frontmatter with Windows (CRLF) line endings', () => {
    const parsed = parseFrontmatter(
      '---\r\ntitle: Windows Test\r\nstatus: GAP\r\ntags: [test, crlf]\r\n---\r\n\r\n# Content'
    );
    expect(parsed.title).toBe('Windows Test');
    expect(parsed.status).toBe('GAP');
    expect(parsed.tags).toEqual(['test', 'crlf']);
  });
});

describe('featureHeader regex', () => {
  function matchFeatureHeaders(text: string): { id: string | undefined; title: string }[] {
    const results: { id: string | undefined; title: string }[] = [];
    const regex = new RegExp(PATTERNS.featureHeader.source, PATTERNS.featureHeader.flags);
    for (const match of text.matchAll(regex)) {
      results.push({ id: match[1], title: match[2]! });
    }
    return results;
  }

  it('matches feature headers with #N: prefix', () => {
    const text = '### #1: Entity Schema & Graph Storage\n### #2: Entity Resolution';
    const matches = matchFeatureHeaders(text);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ id: '1', title: 'Entity Schema & Graph Storage' });
    expect(matches[1]).toEqual({ id: '2', title: 'Entity Resolution' });
  });

  it('does not match plain ### headings without #N prefix', () => {
    const text = '### Architecture Overview\n### Implementation Notes';
    const matches = matchFeatureHeaders(text);
    expect(matches).toHaveLength(0);
  });

  it('does not match #### or ## headings', () => {
    const text = '## #1: Not a feature\n#### #2: Also not a feature';
    const matches = matchFeatureHeaders(text);
    expect(matches).toHaveLength(0);
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

  it('does not create plan entities from bare 4-digit numbers in body text', () => {
    const root = mkdtempSync(join(tmpdir(), 'limps-graph-planref-'));
    const planDir = join(root, '0099-False Positive Test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    try {
      writeFileSync(
        join(planDir, '0099-False Positive Test-plan.md'),
        `---
title: False Positive Test
status: draft
---

# False Positive Test
`,
        'utf8'
      );

      writeFileSync(
        join(agentsDir, '001-test-agent.agent.md'),
        `---
title: Test Agent
status: GAP
depends_on: []
---

# Agent 001: Test Agent

In 2024, the API was refactored.
The service handles 3000 concurrent users on port 8080.
`,
        'utf8'
      );

      const extractor = new EntityExtractor();
      const result = extractor.extractPlan(planDir);

      expect(result.entities.some((e) => e.canonicalId === 'plan:2024')).toBe(false);
      expect(result.entities.some((e) => e.canonicalId === 'plan:3000')).toBe(false);
      expect(result.entities.some((e) => e.canonicalId === 'plan:8080')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not create tag entities from status tokens in body text', () => {
    const root = mkdtempSync(join(tmpdir(), 'limps-graph-tag-'));
    const planDir = join(root, '0098-Tag Filter Test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    try {
      writeFileSync(
        join(planDir, '0098-Tag Filter Test-plan.md'),
        `---
title: Tag Filter Test
status: draft
---

# Tag Filter Test
`,
        'utf8'
      );

      writeFileSync(
        join(agentsDir, '001-test-agent.agent.md'),
        `---
title: Tag Test Agent
status: PASS
depends_on: []
tags: [real-tag]
---

# Agent 001: Tag Test Agent

This has #PASS status and #WIP items.
Also #GAP and #BLOCKED mentions.
But #legitimate-tag should still work.
`,
        'utf8'
      );

      const extractor = new EntityExtractor();
      const result = extractor.extractPlan(planDir);

      expect(result.entities.some((e) => e.canonicalId === 'tag:pass')).toBe(false);
      expect(result.entities.some((e) => e.canonicalId === 'tag:wip')).toBe(false);
      expect(result.entities.some((e) => e.canonicalId === 'tag:gap')).toBe(false);
      expect(result.entities.some((e) => e.canonicalId === 'tag:blocked')).toBe(false);
      expect(result.entities.some((e) => e.canonicalId === 'tag:real-tag')).toBe(true);
      expect(result.entities.some((e) => e.canonicalId === 'tag:legitimate-tag')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('warns when falling back to non-plan markdown file', () => {
    const root = mkdtempSync(join(tmpdir(), 'limps-graph-planmd-'));
    const planDir = join(root, '0097-Warn Test');
    mkdirSync(planDir, { recursive: true });

    try {
      writeFileSync(
        join(planDir, 'README.md'),
        `---
title: Just a README
status: draft
---

# README

Some content.
`,
        'utf8'
      );

      const extractor = new EntityExtractor();
      const result = extractor.extractPlan(planDir);

      expect(
        result.warnings.some((w) => w.includes('No *-plan.md') || w.includes('non-plan'))
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
