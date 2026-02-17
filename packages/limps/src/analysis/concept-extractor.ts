/**
 * Concept extraction from document content.
 * Extracts concepts from headings, code blocks, and technical terms.
 */

/**
 * An extracted concept with its source context.
 */
export interface ExtractedConcept {
  name: string;
  source: 'heading' | 'code_block' | 'technical_term';
  frequency: number;
}

/**
 * Common stop words to filter out non-meaningful terms.
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'ought',
  'and',
  'or',
  'but',
  'if',
  'then',
  'else',
  'when',
  'while',
  'for',
  'to',
  'from',
  'in',
  'on',
  'at',
  'by',
  'with',
  'about',
  'against',
  'between',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'of',
  'up',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'not',
  'only',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'here',
  'there',
  'use',
  'using',
  'used',
  'new',
  'first',
  'last',
  'next',
  'see',
  'get',
  'set',
  'make',
]);

/**
 * Normalize a concept name for deduplication.
 */
function normalizeConcept(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_/. ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Extract concepts from headings (## and ### level).
 */
function extractFromHeadings(content: string): Map<string, ExtractedConcept> {
  const concepts = new Map<string, ExtractedConcept>();
  const headingPattern = /^#{2,3}\s+(.+)$/gm;

  for (const match of content.matchAll(headingPattern)) {
    const heading = match[1]?.trim();
    if (!heading || heading.length < 3) continue;

    const normalized = normalizeConcept(heading);
    if (normalized.length < 3) continue;

    const existing = concepts.get(normalized);
    if (existing) {
      existing.frequency++;
    } else {
      concepts.set(normalized, {
        name: heading,
        source: 'heading',
        frequency: 1,
      });
    }
  }

  return concepts;
}

/**
 * Extract concepts from code block language identifiers and inline code.
 */
function extractFromCodeBlocks(content: string): Map<string, ExtractedConcept> {
  const concepts = new Map<string, ExtractedConcept>();

  // Fenced code block languages
  const codeBlockPattern = /^```(\w+)/gm;
  for (const match of content.matchAll(codeBlockPattern)) {
    const lang = match[1]?.trim().toLowerCase();
    if (!lang || lang.length < 2) continue;

    const existing = concepts.get(lang);
    if (existing) {
      existing.frequency++;
    } else {
      concepts.set(lang, {
        name: lang,
        source: 'code_block',
        frequency: 1,
      });
    }
  }

  // Technical identifiers in inline code (e.g., `functionName`, `ClassName`)
  const inlineCodePattern = /`([A-Za-z][A-Za-z0-9_.-]{2,})`/g;
  for (const match of content.matchAll(inlineCodePattern)) {
    const term = match[1]?.trim();
    if (!term || term.length < 3) continue;
    const normalized = normalizeConcept(term);
    if (STOP_WORDS.has(normalized)) continue;

    const existing = concepts.get(normalized);
    if (existing) {
      existing.frequency++;
    } else {
      concepts.set(normalized, {
        name: term,
        source: 'code_block',
        frequency: 1,
      });
    }
  }

  return concepts;
}

/**
 * Extract technical terms from content.
 * Matches PascalCase, camelCase, SCREAMING_SNAKE, and hyphenated-terms.
 */
function extractTechnicalTerms(content: string): Map<string, ExtractedConcept> {
  const concepts = new Map<string, ExtractedConcept>();

  // Strip code blocks to avoid double counting
  const stripped = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');

  // PascalCase / camelCase identifiers (at least 2 words joined)
  const camelPattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;
  for (const match of stripped.matchAll(camelPattern)) {
    const term = match[1];
    if (!term || term.length < 4) continue;
    const normalized = normalizeConcept(term);

    const existing = concepts.get(normalized);
    if (existing) {
      existing.frequency++;
    } else {
      concepts.set(normalized, {
        name: term,
        source: 'technical_term',
        frequency: 1,
      });
    }
  }

  // SCREAMING_SNAKE_CASE constants: start with a letter, contain at least 4 chars total,
  // and must end with a letter or digit to avoid matching tokens like "A___".
  const screamingPattern = /\b([A-Z][A-Z0-9_]{2,}[A-Z0-9])\b/g;
  for (const match of stripped.matchAll(screamingPattern)) {
    const term = match[1];
    if (!term) continue;
    const normalized = normalizeConcept(term);

    const existing = concepts.get(normalized);
    if (existing) {
      existing.frequency++;
    } else {
      concepts.set(normalized, {
        name: term,
        source: 'technical_term',
        frequency: 1,
      });
    }
  }

  return concepts;
}

/**
 * Extract all concepts from document content.
 * Merges concepts from headings, code blocks, and technical terms.
 * Only returns concepts that appear at least `minFrequency` times.
 *
 * @param content - Markdown document content
 * @param minFrequency - Minimum occurrence count to include (default: 1)
 * @returns Array of extracted concepts
 */
export function extractConcepts(content: string, minFrequency = 1): ExtractedConcept[] {
  const merged = new Map<string, ExtractedConcept>();

  const sources = [
    extractFromHeadings(content),
    extractFromCodeBlocks(content),
    extractTechnicalTerms(content),
  ];

  for (const conceptMap of sources) {
    for (const [key, concept] of conceptMap) {
      const existing = merged.get(key);
      if (existing) {
        existing.frequency += concept.frequency;
        // Keep the more specific source
        if (concept.source === 'heading') {
          existing.source = 'heading';
        }
      } else {
        merged.set(key, { ...concept });
      }
    }
  }

  return Array.from(merged.values())
    .filter((c) => c.frequency >= minFrequency)
    .sort((a, b) => b.frequency - a.frequency);
}
