import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from './config.js';

/**
 * Context passed to tool handlers.
 */
export interface ToolContext {
  db: DatabaseType;
  config: ServerConfig;
}

/**
 * A suggested next action for the AI agent to take after a tool call.
 */
export interface NextStep {
  /** MCP tool name to call next */
  tool: string;
  /** Human-readable explanation of why this step is recommended */
  reason: string;
  /** Optional suggested input parameters for the tool */
  params?: Record<string, unknown>;
}

/**
 * Context passed to resource handlers.
 */
export interface ResourceContext {
  db: DatabaseType;
  config: ServerConfig;
}

/**
 * Result returned by tool handlers.
 * Matches MCP SDK tool result format.
 * Index signature required for MCP SDK compatibility.
 */
export interface ToolResult {
  [key: string]: unknown;
  content: {
    type: 'text';
    text: string;
  }[];
  isError?: boolean;
}

/**
 * Result returned by resource handlers.
 * Matches MCP SDK resource result format.
 * Index signature required for MCP SDK compatibility.
 */
export interface ResourceResult {
  [key: string]: unknown;
  contents: (
    | {
        uri: string;
        mimeType?: string;
        text: string; // Required if text content
        blob?: never; // Mutually exclusive with text
      }
    | {
        uri: string;
        mimeType?: string;
        blob: string; // Required if binary content (base64 encoded)
        text?: never; // Mutually exclusive with blob
      }
  )[];
}
