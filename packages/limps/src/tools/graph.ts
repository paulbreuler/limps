import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types.js';
import { openGraphDb } from '../cli/graph-db.js';
import { graphHealth } from '../cli/graph-health.js';
import { graphSearch } from '../cli/graph-search.js';
import { graphTrace } from '../cli/graph-trace.js';
import { graphEntity } from '../cli/graph-entity.js';
import { graphOverlap } from '../cli/graph-overlap.js';
import { graphReindex } from '../cli/graph-reindex.js';
import { graphCheck } from '../cli/graph-check.js';
import { graphSuggest, type GraphSuggestType } from '../cli/graph-suggest.js';
import type { ConflictType } from '../graph/conflict-detector.js';

export const GraphInputSchema = z.object({
  command: z
    .enum(['health', 'search', 'trace', 'entity', 'overlap', 'reindex', 'check', 'suggest'])
    .describe('Graph subcommand to execute'),
  query: z.string().optional().describe('Search query (for "search")'),
  entityId: z
    .string()
    .optional()
    .describe('Entity canonical ID, e.g. plan:0042, agent:0042#003 (for "trace", "entity")'),
  planId: z
    .string()
    .optional()
    .describe('Filter to specific plan (for "reindex", "overlap", "suggest")'),
  type: z
    .string()
    .optional()
    .describe(
      'Subtype filter. For "check": file_contention|feature_overlap|circular_dependency|stale_wip. For "suggest": consolidate|next-task'
    ),
  direction: z
    .enum(['up', 'down', 'both'])
    .optional()
    .describe('Traversal direction (for "trace", default: both)'),
  depth: z.number().optional().describe('Max traversal depth (for "trace", default: 2)'),
  topK: z.number().optional().describe('Number of results (for "search", default: 10)'),
  recipe: z.string().optional().describe('Search recipe name (for "search")'),
  threshold: z.number().optional().describe('Similarity threshold 0-1 (for "overlap")'),
  incremental: z.boolean().optional().describe('Skip unchanged files (for "reindex")'),
});

type GraphInput = z.infer<typeof GraphInputSchema>;

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

export async function handleGraph(input: GraphInput, context: ToolContext): Promise<ToolResult> {
  const db = openGraphDb(context.config);
  try {
    switch (input.command) {
      case 'health':
        return jsonResult(graphHealth(context.config, db));

      case 'search': {
        if (!input.query) return errorResult('Missing required parameter: query');
        const searchResult = await graphSearch(context.config, db, input.query, {
          topK: input.topK,
          recipe: input.recipe,
        });
        return jsonResult(searchResult);
      }

      case 'trace': {
        if (!input.entityId) return errorResult('Missing required parameter: entityId');
        return jsonResult(
          graphTrace(context.config, db, input.entityId, {
            direction: input.direction,
            depth: input.depth,
          })
        );
      }

      case 'entity': {
        if (!input.entityId) return errorResult('Missing required parameter: entityId');
        return jsonResult(graphEntity(context.config, db, input.entityId));
      }

      case 'overlap':
        return jsonResult(
          graphOverlap(context.config, db, {
            planId: input.planId,
            threshold: input.threshold,
          })
        );

      case 'reindex':
        return jsonResult(
          graphReindex(context.config, db, {
            planId: input.planId,
            incremental: input.incremental,
          })
        );

      case 'check':
        return jsonResult(
          graphCheck(context.config, db, {
            type: input.type as ConflictType | undefined,
          })
        );

      case 'suggest': {
        const suggestType = input.type as GraphSuggestType | undefined;
        if (!suggestType || !['consolidate', 'next-task'].includes(suggestType)) {
          return errorResult('Missing or invalid parameter: type (consolidate|next-task)');
        }
        return jsonResult(graphSuggest(context.config, db, suggestType, { planId: input.planId }));
      }

      default:
        return errorResult(`Unknown graph command: ${input.command}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(message);
  } finally {
    db.close();
  }
}
