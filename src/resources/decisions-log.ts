import type { ResourceContext, ResourceResult } from '../types.js';

/**
 * Decision entry interface.
 */
export interface DecisionEntry {
  date: string; // ISO timestamp
  planId: string;
  title: string;
  rationale: string;
  context: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 */
function parseYamlFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const yamlRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(yamlRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    if (typeof value === 'string') {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
    }

    if (key) {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * Extract plan ID from file path.
 */
function extractPlanId(path: string, plansPath: string): string | null {
  const relativePath = path.replace(plansPath, '').replace(/^[/\\]/, '');
  const match = relativePath.match(/^([^/\\]+)/);
  return match ? match[1] : null;
}

/**
 * Extract decisions from markdown content.
 * Looks for decision patterns like "Decision:", "We decided", etc.
 */
function extractDecisions(content: string, planId: string, modifiedAt: number): DecisionEntry[] {
  const decisions: DecisionEntry[] = [];

  // Extract title from first H1
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

  // Look for decision patterns
  // Pattern 1: "## Decision" or "### Decision" sections
  const decisionSectionRegex = /^#{2,3}\s+Decision[:\s]*(.+?)(?=^#{1,3}\s+|$)/gms;
  const sectionMatches = Array.from(content.matchAll(decisionSectionRegex));

  for (const match of sectionMatches) {
    const decisionText = match[1] || match[0];
    const rationale = decisionText.trim().substring(0, 500); // Limit length

    decisions.push({
      date: new Date(modifiedAt).toISOString(),
      planId,
      title: `${title} - Decision`,
      rationale,
      context: content.substring(0, 200), // First 200 chars as context
    });
  }

  // Pattern 2: "We decided" or "Decision:" in text
  const decisionTextRegex = /(?:We\s+decided|Decision[:\s]+)(.+?)(?=\n\n|$)/gi;
  const textMatches = Array.from(content.matchAll(decisionTextRegex));

  for (const match of textMatches) {
    const rationale = match[1].trim().substring(0, 500);

    // Avoid duplicates
    if (!decisions.some((d) => d.rationale === rationale)) {
      decisions.push({
        date: new Date(modifiedAt).toISOString(),
        planId,
        title: `${title} - Decision`,
        rationale,
        context: content.substring(0, 200),
      });
    }
  }

  // Pattern 3: Look in frontmatter for decision fields
  const { frontmatter } = parseYamlFrontmatter(content);
  if (frontmatter.decision || frontmatter.decisions) {
    const decisionValue = frontmatter.decision || frontmatter.decisions;
    const rationale =
      typeof decisionValue === 'string' ? decisionValue : JSON.stringify(decisionValue);

    decisions.push({
      date: new Date(modifiedAt).toISOString(),
      planId,
      title: `${title} - Decision`,
      rationale: rationale.substring(0, 500),
      context: content.substring(0, 200),
    });
  }

  return decisions;
}

/**
 * Handle decisions://log resource request.
 * Returns chronological decision log with rationale from planning documents.
 *
 * @param uri - Resource URI (should be 'decisions://log')
 * @param context - Resource context
 * @returns Resource result with decisions log
 */
export async function handleDecisionsLog(
  uri: string,
  context: ResourceContext
): Promise<ResourceResult> {
  const { db, config } = context;
  const plansPath = config.plansPath;

  // Query all plan documents from database
  const allDocs = db
    .prepare(
      `
    SELECT path, content, modified_at
    FROM documents
    WHERE path LIKE ?
    ORDER BY modified_at DESC
  `
    )
    .all(`${plansPath}%plan.md`) as {
    path: string;
    content: string;
    modified_at: number;
  }[];

  const allDecisions: DecisionEntry[] = [];

  for (const doc of allDocs) {
    const planId = extractPlanId(doc.path, plansPath);
    if (!planId) {
      continue;
    }

    const decisions = extractDecisions(doc.content, planId, doc.modified_at);
    allDecisions.push(...decisions);
  }

  // Sort chronologically (newest first)
  allDecisions.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA; // Descending (newest first)
  });

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          decisions: allDecisions,
          total: allDecisions.length,
        }),
      },
    ],
  };
}
