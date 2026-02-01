/**
 * JSON output utilities for CLI commands.
 *
 * Provides consistent JSON envelope format for all CLI commands when --json flag is used.
 * This enables scripting, CI/CD integration, and machine-readable output.
 */

/**
 * Success envelope for JSON output.
 */
export interface JsonSuccess<T> {
  success: true;
  data: T;
}

import type { HelpMeta } from '../utils/cli-help.js';

/**
 * Error envelope for JSON output.
 */
export interface JsonError {
  success: false;
  error: string;
  code?: string;
  suggestions?: string[];
  help?: HelpMeta;
}

/**
 * Union type for all JSON responses.
 */
export type JsonEnvelope<T> = JsonSuccess<T> | JsonError;

/**
 * Wrap data in success envelope.
 *
 * @param data - The data to wrap
 * @returns Success envelope with data
 */
export function wrapSuccess<T>(data: T): JsonSuccess<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Wrap error in error envelope.
 *
 * @param message - Error message
 * @param options - Optional code and suggestions
 * @returns Error envelope
 */
export function wrapError(
  message: string,
  options?: { code?: string; suggestions?: string[]; help?: HelpMeta }
): JsonError {
  const envelope: JsonError = {
    success: false,
    error: message,
  };

  if (options?.code) {
    envelope.code = options.code;
  }

  if (options?.suggestions && options.suggestions.length > 0) {
    envelope.suggestions = options.suggestions;
  }

  if (options?.help) {
    envelope.help = options.help;
  }

  return envelope;
}

/**
 * Output JSON to stdout and exit.
 * Bypasses Ink rendering entirely for clean JSON output.
 *
 * @param envelope - JSON envelope to output
 * @param exitCode - Exit code (default: 0 for success, 1 for error)
 */
export function outputJson<T>(envelope: JsonEnvelope<T>, exitCode?: number): never {
  const code = exitCode ?? (envelope.success ? 0 : 1);

  // Write JSON to stdout
  console.log(JSON.stringify(envelope, null, 2));

  // Exit with appropriate code
  process.exit(code);
}

/**
 * Check if JSON output mode is requested.
 * Useful for early bailout in command handlers.
 *
 * @param options - Command options
 * @returns True if --json flag is set
 */
export function isJsonMode(options: { json?: boolean }): boolean {
  return options.json === true;
}

/**
 * Handle JSON output for a command.
 * Executes the data getter and outputs JSON, catching errors.
 *
 * @param getData - Function that returns data or throws
 * @param errorCode - Optional error code for failures
 */
export function handleJsonOutput<T>(getData: () => T, errorCode?: string): never {
  try {
    const data = getData();
    outputJson(wrapSuccess(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const suggestions =
      error instanceof Error && 'suggestions' in error
        ? (error as Error & { suggestions?: string[] }).suggestions
        : undefined;

    outputJson(wrapError(message, { code: errorCode, suggestions }), 1);
  }
}
