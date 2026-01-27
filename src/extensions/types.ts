import type { z } from 'zod';
import type { ToolResult, ResourceResult } from '../types.js';

/**
 * Simple logger interface for extensions.
 * Uses console.error for consistency with limps server logging.
 */
export interface Logger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Tool definition for extensions.
 * Matches the structure used by limps internal tools.
 * inputSchema must be a ZodObject to provide `.shape` for MCP SDK registration.
 */
export interface ExtensionTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (input: unknown) => Promise<ToolResult>;
}

/**
 * Resource definition for extensions.
 */
export interface ExtensionResource {
  name: string;
  uri: string;
  handler: (uri: URL) => Promise<ResourceResult>;
}

/**
 * Context provided to extensions during initialization.
 */
export interface ExtensionContext {
  dataDir: string;
  config: Record<string, unknown>;
  logger: Logger;
}

/**
 * Extension interface that all limps extensions must implement.
 */
export interface LimpsExtension {
  name: string;
  version: string;
  tools?: ExtensionTool[];
  resources?: ExtensionResource[];
  onInit?(context: ExtensionContext): Promise<void>;
  onShutdown?(): Promise<void>;
}
