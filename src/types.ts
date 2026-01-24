import type { Database as DatabaseType } from 'better-sqlite3';
import type { CoordinationState } from './coordination.js';
import type { ServerConfig } from './config.js';

/**
 * Context passed to tool handlers.
 */
export interface ToolContext {
  db: DatabaseType;
  coordination: CoordinationState;
  config: ServerConfig;
}

/**
 * Context passed to resource handlers.
 */
export interface ResourceContext {
  db: DatabaseType;
  coordination: CoordinationState;
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
 */
export interface ResourceResult {
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
