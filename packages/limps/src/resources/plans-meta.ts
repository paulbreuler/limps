/**
 * MCP resource handler: plans://meta/{planId}
 *
 * Returns lightweight DB-backed plan metadata (name, status, task counts)
 * without reading agent files from disk. This is the fast-path alternative
 * to plans://summary/* for large plans.
 *
 * Falls back to scanning the filesystem when the plan is not yet indexed.
 */

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ResourceContext, ResourceResult } from '../types.js';

/**
 * Lightweight plan metadata returned from the DB.
 */
interface PlanMeta {
  planId: string;
  name: string;
  taskCounts: {
    GAP: number;
    WIP: number;
    PASS: number;
    BLOCKED: number;
    total: number;
  };
  source: 'db' | 'fs';
}

/**
 * Count agent statuses from the database for a given plan directory prefix.
 */
function queryPlanMetaFromDb(
  db: ResourceContext['db'],
  planDir: string
): { GAP: number; WIP: number; PASS: number; BLOCKED: number } | null {
  try {
    const rows = db
      .prepare(`SELECT content FROM documents WHERE path LIKE ? AND path LIKE '%/agents/%'`)
      .all(`${planDir}%`) as { content: string }[];

    if (rows.length === 0) return null;

    const counts = { GAP: 0, WIP: 0, PASS: 0, BLOCKED: 0 };
    for (const row of rows) {
      // Fast frontmatter status extraction without full parse
      const match = row.content.match(/^status:\s*["']?(GAP|WIP|PASS|BLOCKED)["']?/im);
      if (match) {
        const status = match[1] as keyof typeof counts;
        counts[status]++;
      } else {
        counts.GAP++;
      }
    }

    return counts;
  } catch {
    return null;
  }
}

/**
 * Count agent statuses from the filesystem as a fallback.
 */
function queryPlanMetaFromFs(planDir: string): {
  GAP: number;
  WIP: number;
  PASS: number;
  BLOCKED: number;
} {
  const counts = { GAP: 0, WIP: 0, PASS: 0, BLOCKED: 0 };
  const agentsDir = join(planDir, 'agents');

  if (!existsSync(agentsDir)) return counts;

  const scanDir = (dir: string): void => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const content = readFileSync(join(dir, entry.name), 'utf-8');
          const match = content.match(/^status:\s*["']?(GAP|WIP|PASS|BLOCKED)["']?/im);
          if (match) {
            const status = match[1] as keyof typeof counts;
            counts[status]++;
          } else {
            counts.GAP++;
          }
        } else if (entry.isDirectory()) {
          scanDir(join(dir, entry.name));
        }
      }
    } catch {
      // ignore unreadable directories
    }
  };

  scanDir(agentsDir);
  return counts;
}

/**
 * Parse the planId from a plans://meta/ URI.
 * Accepts: plans://meta/0001-feature-name or plans://meta/1
 */
function parsePlanId(uriString: string): string {
  const match = uriString.match(/^plans:\/\/meta\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Resolve planId to actual directory under plansPath.
 */
function resolvePlanDir(plansPath: string, planId: string): string | null {
  if (!existsSync(plansPath)) return null;

  const entries = readdirSync(plansPath, { withFileTypes: true }).filter((e) => e.isDirectory());

  // Exact match
  const exact = entries.find((e) => e.name === planId);
  if (exact) return join(plansPath, exact.name);

  // Match by number prefix (e.g. "4" matches "0004-feature")
  const numericId = planId.replace(/^0+/, '');
  const byNumber = entries.find((e) => {
    const m = e.name.match(/^0*(\d+)-/);
    return m ? m[1] === numericId : false;
  });
  if (byNumber) return join(plansPath, byNumber.name);

  // Match by name suffix (e.g. "feature-auth" matches "0001-feature-auth")
  const byName = entries.find((e) => {
    const m = e.name.match(/^\d+-(.+)$/);
    return m ? m[1] === planId : false;
  });
  if (byName) return join(plansPath, byName.name);

  return null;
}

/**
 * Handle plans://meta/* resource request.
 *
 * @param uriString - Full resource URI
 * @param context - Resource context
 * @returns Resource result with lightweight plan metadata
 */
export async function handlePlanMeta(
  uriString: string,
  context: ResourceContext
): Promise<ResourceResult> {
  const planId = parsePlanId(uriString);

  if (!planId) {
    return {
      contents: [
        {
          uri: uriString,
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Missing plan ID in URI. Use plans://meta/{planId}' }),
        },
      ],
    };
  }

  const planDir = resolvePlanDir(context.config.plansPath, planId);

  if (!planDir) {
    return {
      contents: [
        {
          uri: uriString,
          mimeType: 'application/json',
          text: JSON.stringify({ error: `Plan not found: ${planId}` }),
        },
      ],
    };
  }

  const planName = planDir.split('/').pop() ?? planId;

  // Try DB fast path first
  const dbCounts = queryPlanMetaFromDb(context.db, planDir);
  let source: 'db' | 'fs';
  let counts: { GAP: number; WIP: number; PASS: number; BLOCKED: number };

  if (dbCounts) {
    counts = dbCounts;
    source = 'db';
  } else {
    counts = queryPlanMetaFromFs(planDir);
    source = 'fs';
  }

  const meta: PlanMeta = {
    planId,
    name: planName,
    taskCounts: {
      ...counts,
      total: counts.GAP + counts.WIP + counts.PASS + counts.BLOCKED,
    },
    source,
  };

  return {
    contents: [
      {
        uri: uriString,
        mimeType: 'application/json',
        text: JSON.stringify(meta, null, 2),
      },
    ],
  };
}
