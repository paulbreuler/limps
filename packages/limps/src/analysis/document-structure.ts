/**
 * DocumentAnalyzer: extracts references from markdown documents.
 *
 * Detects:
 * - Markdown links [text](url)
 * - Wikilinks [[target]] and [[target|alias]]
 * - Code imports (import/require statements)
 * - File path mentions in prose (backtick-wrapped paths)
 * - Cross-repo file references (e.g. ../other-repo/path)
 */

export interface DocumentReference {
  /** The raw reference string as found in the document */
  raw: string;
  /** Normalized target path or identifier */
  target: string;
  /** Type of reference detected */
  type: 'markdown_link' | 'wikilink' | 'code_import' | 'file_mention';
  /** Confidence score 0-1 */
  confidence: number;
  /** Line number where the reference was found (1-based) */
  line: number;
  /** Whether this references a file outside the current repo */
  crossRepo: boolean;
}

export interface DocumentAnalysisResult {
  /** Source document path */
  sourcePath: string;
  /** All references found */
  references: DocumentReference[];
  /** Count by type */
  counts: Record<DocumentReference['type'], number>;
}

// Patterns for reference extraction
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
const CODE_IMPORT_RE =
  /(?:import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
const FILE_MENTION_RE = /`([\w./-]+\.(?:ts|js|tsx|jsx|md|json|py|rs|go|sql|yaml|yml|toml))`/g;

// URL pattern to filter out external links
const EXTERNAL_URL_RE = /^https?:\/\//;
const ANCHOR_ONLY_RE = /^#/;

// Cross-repo heuristic: paths going up beyond reasonable depth or explicit repo references
const CROSS_REPO_RE = /(?:\.\.\/){3,}|[\w-]+\/[\w-]+(?:\.git)?:/;

function isExternalUrl(target: string): boolean {
  return EXTERNAL_URL_RE.test(target);
}

function isAnchorOnly(target: string): boolean {
  return ANCHOR_ONLY_RE.test(target);
}

function isCrossRepo(target: string): boolean {
  return CROSS_REPO_RE.test(target);
}

function normalizeTarget(raw: string): string {
  // Strip anchor fragments
  const withoutAnchor = raw.split('#')[0] ?? raw;
  // Strip query params
  const withoutQuery = withoutAnchor.split('?')[0] ?? withoutAnchor;
  // Trim whitespace
  return withoutQuery.trim();
}

export class DocumentAnalyzer {
  /**
   * Analyze a markdown document and extract all references.
   *
   * @param content - The markdown content to analyze
   * @param sourcePath - Path of the source document
   * @returns Analysis result with all found references
   */
  analyze(content: string, sourcePath: string): DocumentAnalysisResult {
    const references: DocumentReference[] = [];
    const lines = content.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx] ?? '';
      const lineNum = lineIdx + 1;

      this.extractMarkdownLinks(line, lineNum, references);
      this.extractWikilinks(line, lineNum, references);
      this.extractCodeImports(line, lineNum, references);
      this.extractFileMentions(line, lineNum, references);
    }

    const counts: Record<DocumentReference['type'], number> = {
      markdown_link: 0,
      wikilink: 0,
      code_import: 0,
      file_mention: 0,
    };

    for (const ref of references) {
      counts[ref.type]++;
    }

    return { sourcePath, references, counts };
  }

  private extractMarkdownLinks(line: string, lineNum: number, refs: DocumentReference[]): void {
    for (const match of line.matchAll(MARKDOWN_LINK_RE)) {
      const raw = match[2] ?? '';
      if (isExternalUrl(raw) || isAnchorOnly(raw)) continue;

      const target = normalizeTarget(raw);
      if (!target) continue;

      refs.push({
        raw,
        target,
        type: 'markdown_link',
        confidence: 0.9,
        line: lineNum,
        crossRepo: isCrossRepo(target),
      });
    }
  }

  private extractWikilinks(line: string, lineNum: number, refs: DocumentReference[]): void {
    for (const match of line.matchAll(WIKILINK_RE)) {
      const raw = match[1] ?? '';
      const target = normalizeTarget(raw);
      if (!target) continue;

      refs.push({
        raw,
        target,
        type: 'wikilink',
        confidence: 1.0,
        line: lineNum,
        crossRepo: isCrossRepo(target),
      });
    }
  }

  private extractCodeImports(line: string, lineNum: number, refs: DocumentReference[]): void {
    for (const match of line.matchAll(CODE_IMPORT_RE)) {
      const raw = match[1] ?? match[2] ?? '';
      if (!raw) continue;
      // Skip node built-ins and bare package imports without paths
      if (!raw.startsWith('.') && !raw.startsWith('/')) continue;

      const target = normalizeTarget(raw);
      if (!target) continue;

      refs.push({
        raw,
        target,
        type: 'code_import',
        confidence: 1.0,
        line: lineNum,
        crossRepo: isCrossRepo(target),
      });
    }
  }

  private extractFileMentions(line: string, lineNum: number, refs: DocumentReference[]): void {
    for (const match of line.matchAll(FILE_MENTION_RE)) {
      const raw = match[1] ?? '';
      const target = normalizeTarget(raw);
      if (!target) continue;

      refs.push({
        raw,
        target,
        type: 'file_mention',
        confidence: 0.7,
        line: lineNum,
        crossRepo: isCrossRepo(target),
      });
    }
  }
}
