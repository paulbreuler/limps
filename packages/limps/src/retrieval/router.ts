import { getRecipe } from './recipes.js';
import type { SearchRecipe } from './types.js';

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
 * Route query to retrieval recipe using deterministic regex patterns.
 * Order matters: specific intent patterns checked before generic entity lookups.
 */
export function routeQuery(query: string): SearchRecipe {
  const q = query.toLowerCase();

  // 1a. Question-based relational queries → EDGE_HYBRID_RRF
  if (QUESTION_RELATION.test(q)) {
    return getRecipe('EDGE_HYBRID_RRF');
  }

  // 1b. Question-based status queries → EDGE_HYBRID_RRF
  if (QUESTION_STATUS.test(q)) {
    return getRecipe('EDGE_HYBRID_RRF');
  }

  // 1c. Conceptual queries with entities → NODE_HYBRID_RRF
  if (CONCEPT_WITH_ENTITY.test(q)) {
    return getRecipe('NODE_HYBRID_RRF');
  }

  // 2. Exact entity references → LEXICAL_FIRST
  if (ENTITY_QUERY.test(query)) {
    return getRecipe('LEXICAL_FIRST');
  }

  // 3. Relational queries → EDGE_HYBRID_RRF
  if (RELATION_QUERY.test(q)) {
    return getRecipe('EDGE_HYBRID_RRF');
  }

  // 4. Conceptual queries → SEMANTIC_FIRST
  if (CONCEPT_QUERY.test(q)) {
    return getRecipe('SEMANTIC_FIRST');
  }

  // 5. Status queries → EDGE_HYBRID_RRF
  if (STATUS_QUERY.test(q)) {
    return getRecipe('EDGE_HYBRID_RRF');
  }

  // 6. File queries → LEXICAL_FIRST
  if (FILE_QUERY.test(q)) {
    return getRecipe('LEXICAL_FIRST');
  }

  // 7. Default: HYBRID_BALANCED
  return getRecipe('HYBRID_BALANCED');
}
