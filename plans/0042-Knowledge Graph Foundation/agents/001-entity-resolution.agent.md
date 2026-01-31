---
title: Dependency-Based Entity Extraction
status: GAP
persona: coder
depends: [000]
files: [src/graph/extractor.ts, src/graph/patterns.ts, src/graph/parser.ts]
tags: [extraction, nlp, no-llm]
---

# Agent 001: Dependency-Based Entity Extraction

## Objective

Extract entities and relationships from markdown using regex patterns and lightweight NLP. **No LLM calls.**

## Context

The arxiv paper (2507.03226) demonstrates dependency parsing achieves 94% of LLM performance. We apply this principle: use deterministic extraction that's fast, free, and reproducible.

**Philosophy**: If regex can do it, use regex. If NLP helps, use lightweight NLP (compromise.js). Never use LLM for extraction.

## Tasks

### 1. Pattern Definitions (`src/graph/patterns.ts`)

```typescript
export const PATTERNS = {
  // Plan references
  planId: /(?:plan\s*)?(\d{4})(?:[-\s]+([\w-]+))?/gi,
  planRef: /(?:plan\s+)?(\d{4})(?:#(\d{3}))?/gi,
  
  // Agent references  
  agentId: /(\d{4})#(\d{3})/g,
  agentHeader: /^#\s*Agent\s+(\d{3}):\s*(.+)$/gm,
  
  // Features
  featureHeader: /^###\s*(?:#(\d+):?\s*)?(.+)$/gm,
  featureStatus: /Status:\s*`?(GAP|WIP|PASS|BLOCKED)`?/gi,
  
  // Files (in frontmatter or inline)
  frontmatterFiles: /^files:\s*\[([^\]]+)\]/m,
  inlineFile: /`([\w\/\.-]+\.(ts|js|tsx|jsx|md|json|py|rs|go|sql))`/g,
  
  // Dependencies
  frontmatterDepends: /^depends:\s*\[([^\]]+)\]/m,
  inlineDepends: /depends\s+(?:on\s+)?(?:agent\s+)?(\d{4}#\d{3}|\d{3})/gi,
  
  // Tags
  frontmatterTags: /^tags:\s*\[([^\]]+)\]/m,
  inlineTag: /#([\w-]+)/g,
  
  // Status
  frontmatterStatus: /^status:\s*(\w+)/m,
};
```

### 2. Frontmatter Parser (`src/graph/parser.ts`)

```typescript
export interface ParsedFrontmatter {
  title?: string;
  status?: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED' | 'draft';
  depends?: string[];
  files?: string[];
  tags?: string[];
  persona?: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  
  const yaml = match[1];
  const result: ParsedFrontmatter = {};
  
  // Parse each field with regex (faster than full YAML parse)
  const titleMatch = yaml.match(/^title:\s*(.+)$/m);
  if (titleMatch) result.title = titleMatch[1].trim();
  
  const statusMatch = yaml.match(/^status:\s*(\w+)$/m);
  if (statusMatch) result.status = statusMatch[1] as any;
  
  // Parse arrays
  const dependsMatch = yaml.match(/^depends:\s*\[([^\]]*)\]/m);
  if (dependsMatch) result.depends = parseArray(dependsMatch[1]);
  
  const filesMatch = yaml.match(/^files:\s*\[([^\]]*)\]/m);
  if (filesMatch) result.files = parseArray(filesMatch[1]);
  
  const tagsMatch = yaml.match(/^tags:\s*\[([^\]]*)\]/m);
  if (tagsMatch) result.tags = parseArray(tagsMatch[1]);
  
  return result;
}

function parseArray(str: string): string[] {
  return str.split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
}
```

### 3. Entity Extractor (`src/graph/extractor.ts`)

```typescript
export class EntityExtractor {
  
  extractPlan(planPath: string): ExtractionResult {
    const result: ExtractionResult = { entities: [], relationships: [], warnings: [] };
    
    // 1. Extract plan entity from plan.md
    // 2. Extract features from ### headers
    // 3. Extract agent entities from agents/*.agent.md
    // 4. Extract file entities from frontmatter
    // 5. Extract cross-references from inline mentions
    
    return result;
  }
  
  private extractPlanEntity(planPath: string, content: string): Entity { /* ... */ }
  private extractFeatures(content: string, planId: string): ExtractionResult { /* ... */ }
  private extractAgentEntity(planId: string, filename: string, content: string): ExtractionResult { /* ... */ }
  private extractCrossReferences(content: string, sourceId: string): Relationship[] { /* ... */ }
}
```

### 4. Optional Lightweight NLP

```typescript
import nlp from 'compromise';

export function extractConcepts(text: string): string[] {
  const doc = nlp(text);
  return doc.nouns().out('array')
    .filter(n => n.length > 3)
    .filter(n => !STOPWORDS.has(n.toLowerCase()));
}
```

## Acceptance Criteria

- [ ] Extracts plan, agent, feature, file, tag entities
- [ ] Extracts CONTAINS, DEPENDS_ON, MODIFIES relationships
- [ ] **No LLM calls anywhere**
- [ ] Handles malformed frontmatter gracefully
- [ ] Cross-references detected from inline mentions
- [ ] Performance: <100ms per plan
