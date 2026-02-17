/**
 * DocumentAnalyzer: extracts references from document content.
 * Supports markdown links, wikilinks, code imports, and file path mentions.
 * Stores extracted references as graph relations with confidence scores.
 */

import { readFileSync, existsSync } from 'fs';
import { basename, dirname, resolve, relative } from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import { GraphStorage, computeContentHash, hasChanged } from '../graph/storage.js';
import type { Entity, RelationType } from '../graph/types.js';

/**
 * A reference extracted from document content.
 */
export interface DocumentReference {
  /** The type of reference found */
  type: 'markdown-link' | 'wikilink' | 'code-import' | 'file-mention';
  /** The raw reference text */
  raw: string;
  /** Resolved target path or identifier */
  target: string;
  /** Line number where the reference was found (1-based) */
  line: number;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Result of analyzing a single document.
 */
export interface DocumentAnalysisResult {
  sourcePath: string;
  references: DocumentReference[];
  entityId: number | null;
}

/**
 * Result of analyzing multiple documents.
 */
export interface BatchAnalysisResult {
  analyzed: number;
  skipped: number;
  totalReferences: number;
  errors: { path: string; error: string }[];
}

// --- Reference extraction patterns ---

/** Markdown links: [text](path.md) or [text](./path.md) */
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

/** Wikilinks: [[target]] or [[target|display]] */
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/** Code imports: import ... from '...' or require('...') */
const CODE_IMPORT_RE =
  /(?:import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

/** File path mentions in backticks: `path/to/file.ext` */
const FILE_MENTION_RE =
  /`([\w./-]+\.(?:ts|js|tsx|jsx|md|json|py|rs|go|sql|yaml|yml|toml|css|html|vue|svelte))`/g;

/** URL pattern to skip external links */
const URL_RE = /^https?:\/\//;

/** Anchor-only pattern to skip */
const ANCHOR_RE = /^#/;

/**
 * Analyze a document and extract all references from its content.
 *
 * @param content - Document content to analyze
 * @param sourcePath - Absolute path of the source document
 * @returns Array of extracted references
 */
export function extractReferences(content: string, sourcePath: string): DocumentReference[] {
  const refs: DocumentReference[] = [];
  const lines = content.split('\n');
  const sourceDir = dirname(sourcePath);

  // Build line offset map for position lookup
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1; // +1 for newline
  }

  function getLineNumber(charIndex: number): number {
    for (let i = lineOffsets.length - 1; i >= 0; i--) {
      const lineOffset = lineOffsets[i];
      if (lineOffset !== undefined && charIndex >= lineOffset) {
        return i + 1;
      }
    }
    return 1;
  }

  // Markdown links
  for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
    const target = match[2];
    if (!target || URL_RE.test(target) || ANCHOR_RE.test(target)) {
      continue;
    }
    const resolved = resolve(sourceDir, target);
    refs.push({
      type: 'markdown-link',
      raw: match[0],
      target: resolved,
      line: getLineNumber(match.index ?? 0),
      confidence: 0.9,
    });
  }

  // Wikilinks
  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = match[1]?.trim();
    if (!target) continue;
    refs.push({
      type: 'wikilink',
      raw: match[0],
      target,
      line: getLineNumber(match.index ?? 0),
      confidence: 0.85,
    });
  }

  // Code imports
  for (const match of content.matchAll(CODE_IMPORT_RE)) {
    const target = match[1] ?? match[2];
    if (!target) continue;
    // Skip node_modules imports (bare specifiers)
    if (!target.startsWith('.') && !target.startsWith('/')) {
      continue;
    }
    const resolved = resolve(sourceDir, target);
    refs.push({
      type: 'code-import',
      raw: match[0],
      target: resolved,
      line: getLineNumber(match.index ?? 0),
      confidence: 0.95,
    });
  }

  // File path mentions in backticks
  for (const match of content.matchAll(FILE_MENTION_RE)) {
    const target = match[1];
    if (!target) continue;
    // Resolve relative to source dir if relative, otherwise keep as-is
    const resolved = target.startsWith('/') ? target : resolve(sourceDir, target);
    refs.push({
      type: 'file-mention',
      raw: match[0],
      target: resolved,
      line: getLineNumber(match.index ?? 0),
      confidence: 0.7,
    });
  }

  return refs;
}

/**
 * DocumentAnalyzer: extracts references from documents and stores them as graph relations.
 */
export class DocumentAnalyzer {
  private storage: GraphStorage;

  constructor(db: DatabaseType) {
    this.storage = new GraphStorage(db);
  }

  /**
   * Analyze a single document, extract references, and store as graph relations.
   *
   * @param filePath - Absolute path to the document
   * @param basePath - Base path for computing relative canonical IDs
   * @returns Analysis result
   */
  analyzeDocument(filePath: string, basePath?: string): DocumentAnalysisResult {
    const result: DocumentAnalysisResult = {
      sourcePath: filePath,
      references: [],
      entityId: null,
    };

    if (!existsSync(filePath)) {
      return result;
    }

    const content = readFileSync(filePath, 'utf-8');
    const contentHash = computeContentHash(content);

    // Check if already analyzed with same content
    if (!hasChanged(this.storage, filePath, contentHash)) {
      const existing = this.storage.getEntitiesBySource(filePath);
      if (existing.length > 0 && existing[0]) {
        result.entityId = existing[0].id;
      }
      return result;
    }

    // Extract references
    const references = extractReferences(content, filePath);
    result.references = references;

    // Upsert source entity
    const canonicalId = basePath ? `file:${relative(basePath, filePath)}` : `file:${filePath}`;
    const name = basename(filePath);
    const sourceEntity = this.storage.upsertEntity({
      type: 'file',
      canonicalId,
      name,
      sourcePath: filePath,
      contentHash,
      metadata: {
        referenceCount: references.length,
      },
    });
    result.entityId = sourceEntity.id;

    // Store references as graph relations
    for (const ref of references) {
      this.storeReference(sourceEntity, ref, basePath);
    }

    return result;
  }

  /**
   * Analyze multiple documents in batch.
   *
   * @param filePaths - Array of absolute file paths to analyze
   * @param basePath - Base path for computing relative canonical IDs
   * @returns Batch analysis result
   */
  analyzeDocuments(filePaths: string[], basePath?: string): BatchAnalysisResult {
    const result: BatchAnalysisResult = {
      analyzed: 0,
      skipped: 0,
      totalReferences: 0,
      errors: [],
    };

    for (const filePath of filePaths) {
      try {
        const analysis = this.analyzeDocument(filePath, basePath);
        if (analysis.references.length > 0) {
          result.analyzed++;
          result.totalReferences += analysis.references.length;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.errors.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Store a single reference as a graph relation.
   */
  private storeReference(sourceEntity: Entity, ref: DocumentReference, basePath?: string): void {
    const targetCanonicalId = this.resolveTargetCanonicalId(ref, basePath);

    // Upsert target entity
    const targetName = basename(ref.target);
    const targetEntity = this.storage.upsertEntity({
      type: 'file',
      canonicalId: targetCanonicalId,
      name: targetName,
      sourcePath: ref.type === 'wikilink' ? undefined : ref.target,
      metadata: {},
    });

    // Determine relation type based on reference type
    const relationType: RelationType = ref.type === 'code-import' ? 'MODIFIES' : 'REFERENCES';

    this.storage.upsertRelationship({
      sourceId: sourceEntity.id,
      targetId: targetEntity.id,
      relationType,
      confidence: ref.confidence,
      metadata: {
        referenceType: ref.type,
        line: ref.line,
        raw: ref.raw,
      },
    });
  }

  /**
   * Resolve reference target to a canonical entity ID.
   */
  private resolveTargetCanonicalId(ref: DocumentReference, basePath?: string): string {
    if (ref.type === 'wikilink') {
      // Wikilinks use the target name as canonical ID
      return `file:${ref.target}`;
    }

    if (basePath) {
      return `file:${relative(basePath, ref.target)}`;
    }

    return `file:${ref.target}`;
  }
}
