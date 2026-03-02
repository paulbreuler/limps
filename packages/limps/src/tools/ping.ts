/**
 * MCP tool: ping
 *
 * Lightweight keepalive tool that returns a pong response with a timestamp
 * and a structured availability report so AI agents can self-diagnose
 * limps configuration issues.
 */

import { z } from 'zod';
import { existsSync } from 'fs';
import type { ToolContext, ToolResult } from '../types.js';
import { getAllDocsPaths } from '../config.js';

export const PingInputSchema = z.object({}).strict();

export async function handlePing(
  _input: z.infer<typeof PingInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { config, db } = context;

  // Check plansPath
  const plansPathExists = existsSync(config.plansPath);

  // Check docsPaths
  const allDocsPaths = getAllDocsPaths(config);
  const docsPathsStatus = allDocsPaths.map((p) => ({ path: p, exists: existsSync(p) }));

  // Check DB writable
  let dbWritable = false;
  try {
    db.prepare('SELECT 1').get();
    dbWritable = true;
  } catch {
    dbWritable = false;
  }

  // Check graph DB
  let graphDbInitialized = false;
  try {
    const result = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='graph_nodes'")
      .get();
    graphDbInitialized = result !== undefined;
  } catch {
    graphDbInitialized = false;
  }

  const availability = {
    plansPath: { path: config.plansPath, exists: plansPathExists },
    docsPaths: docsPathsStatus,
    db: { writable: dbWritable },
    graphDb: { initialized: graphDbInitialized },
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ pong: true, timestamp: new Date().toISOString(), availability }),
      },
    ],
  };
}
