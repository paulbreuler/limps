/**
 * MCP tool: ping
 *
 * Lightweight keepalive tool that returns a pong response with a timestamp.
 */

import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types.js';

export const PingInputSchema = z.object({}).strict();

export async function handlePing(
  _input: z.infer<typeof PingInputSchema>,
  _context: ToolContext
): Promise<ToolResult> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ pong: true, timestamp: new Date().toISOString() }),
      },
    ],
  };
}
