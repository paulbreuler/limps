export type RetrievalSource = 'lexical' | 'semantic' | 'graph';

export interface RetrievalStrategy {
  primary: RetrievalSource | 'hybrid';
  weights: { lexical: number; semantic: number; graph: number };
}

const ENTITY_QUERY = /plan\s*\d+|agent\s*#?\d+|\d{4}[-#]\d{3}/i;
const RELATION_QUERY = /depends|blocks|modifies|what.*blocking|related|overlap|contention|trace/i;
const QUESTION_RELATION =
  /(what|which|show|find|check).*\b(depends|blocks|modifies|blocking|related|overlap|contention)/i;
const CONCEPT_QUERY = /\b(how|why|explain|describe|similar|like)\b|what is|tell me about/i;
const CONCEPT_WITH_ENTITY = /\b(similar|like|explain|describe|how|why).*\b(plan|agent|to\s+\d)/i;
const STATUS_QUERY = /status|progress|completion|blocked|wip|gap|pass|done|remaining/i;
const QUESTION_STATUS =
  /(what|which|show|status).*\b(of|for|on|is).*\b(plan|agent|blocked|wip|gap|pass|progress|completion)/i;
const FILE_QUERY = /file|\.ts|\.js|\.md|modif|touch|change/i;

/**
 * Route query to retrieval strategy using deterministic regex patterns.
 * Order matters: specific intent patterns checked before generic entity lookups.
 */
export function routeQuery(query: string): RetrievalStrategy {
  const q = query.toLowerCase();

  // 1a. Question-based relational queries → graph (takes precedence over entity IDs)
  if (QUESTION_RELATION.test(q)) {
    return { primary: 'graph', weights: { graph: 0.5, semantic: 0.3, lexical: 0.2 } };
  }

  // 1b. Question-based status queries → graph (takes precedence over entity IDs)
  if (QUESTION_STATUS.test(q)) {
    return { primary: 'graph', weights: { graph: 0.4, lexical: 0.4, semantic: 0.2 } };
  }

  // 1c. Conceptual queries with entities → semantic (takes precedence over entity IDs)
  if (CONCEPT_WITH_ENTITY.test(q)) {
    return { primary: 'semantic', weights: { semantic: 0.5, lexical: 0.3, graph: 0.2 } };
  }

  // 2. Exact entity references → lexical first
  if (ENTITY_QUERY.test(query)) {
    return { primary: 'lexical', weights: { lexical: 0.6, semantic: 0.2, graph: 0.2 } };
  }

  // 3. Relational queries → graph first
  if (RELATION_QUERY.test(q)) {
    return { primary: 'graph', weights: { graph: 0.5, semantic: 0.3, lexical: 0.2 } };
  }

  // 4. Conceptual queries → semantic first
  if (CONCEPT_QUERY.test(q)) {
    return { primary: 'semantic', weights: { semantic: 0.5, lexical: 0.3, graph: 0.2 } };
  }

  // 5. Status queries → graph + lexical
  if (STATUS_QUERY.test(q)) {
    return { primary: 'graph', weights: { graph: 0.4, lexical: 0.4, semantic: 0.2 } };
  }

  // 6. File queries → lexical + graph
  if (FILE_QUERY.test(q)) {
    return { primary: 'lexical', weights: { lexical: 0.5, graph: 0.3, semantic: 0.2 } };
  }

  // 7. Default: balanced hybrid
  return { primary: 'hybrid', weights: { semantic: 0.4, lexical: 0.3, graph: 0.3 } };
}
