/**
 * Error handling utilities for MCP document CRUD operations.
 * Provides consistent error types with codes, suggestions, and JSON serialization.
 */

import type { JsonError } from '../cli/json-output.js';
import { findSimilar } from './suggestions.js';

/**
 * Error codes for document operations.
 * Includes filesystem error codes (ENOENT, EACCES, etc.) for better error handling.
 */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'ENOENT' // File or directory not found (filesystem error code)
  | 'ALREADY_EXISTS'
  | 'EEXIST' // File already exists (filesystem error code)
  | 'PERMISSION_DENIED'
  | 'EACCES' // Permission denied (filesystem error code)
  | 'VALIDATION_ERROR'
  | 'RESTRICTED_PATH'
  | 'INTERNAL_ERROR'
  | 'EISDIR' // Is a directory (filesystem error code)
  | 'ENOTDIR' // Not a directory (filesystem error code)
  | 'ENOSPC'; // No space left on device (filesystem error code)

/**
 * MCP-compatible error shape for JSON responses.
 */
export interface MCPError {
  code: ErrorCode;
  message: string;
  path?: string;
  suggestion?: string;
}

/**
 * Custom error class for document operations.
 * Extends Error with code, path, suggestion, and JSON serialization.
 */
export class DocumentError extends Error {
  readonly code: ErrorCode;
  readonly path?: string;
  readonly suggestion?: string;

  constructor(code: ErrorCode, message: string, path?: string, suggestion?: string) {
    super(message);
    this.name = 'DocumentError';
    this.code = code;
    this.path = path;
    this.suggestion = suggestion;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, DocumentError.prototype);

    // Capture stack trace (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DocumentError);
    }
  }

  /**
   * Convert to MCP-compatible JSON shape.
   */
  toJSON(): MCPError {
    const result: MCPError = {
      code: this.code,
      message: this.message,
    };

    if (this.path !== undefined) {
      result.path = this.path;
    }

    if (this.suggestion !== undefined) {
      result.suggestion = this.suggestion;
    }

    return result;
  }
}

/**
 * Factory: File not found error.
 *
 * @param path - Path to the file that was not found
 * @param suggestion - Optional custom suggestion
 * @returns DocumentError with NOT_FOUND code
 * @example
 * throw notFound('research/missing.md');
 * // DocumentError: File not found: research/missing.md
 */
export function notFound(path: string, suggestion?: string): DocumentError {
  return new DocumentError(
    'NOT_FOUND',
    `File not found: ${path}. Use list_directory to see available files, or check the path spelling.`,
    path,
    suggestion || 'Use create_doc to create a new file, or check that the path is correct.'
  );
}

/**
 * Factory: Directory not found error.
 *
 * @param path - Path to the directory that was not found
 * @returns DocumentError with ENOENT code
 */
export function directoryNotFound(path: string): DocumentError {
  return new DocumentError(
    'ENOENT',
    `Directory not found: ${path}. Use list_directory with no path or '/' to see root folders.`,
    path,
    'Check that the directory path is correct and exists.'
  );
}

/**
 * Factory: Cannot read directory as file error.
 *
 * @param path - Path that is a directory, not a file
 * @returns DocumentError with EISDIR code
 */
export function isDirectoryError(path: string): DocumentError {
  return new DocumentError(
    'EISDIR',
    `Cannot read directory as file: ${path}. Use list_directory tool instead.`,
    path,
    'Use list_directory to list files in a directory, or read_note to read a file.'
  );
}

/**
 * Factory: Not a directory error.
 *
 * @param path - Path that points to a file, not a directory
 * @returns DocumentError with ENOTDIR code
 */
export function notDirectoryError(path: string): DocumentError {
  return new DocumentError(
    'ENOTDIR',
    `Not a directory: ${path}. This path points to a file, not a folder. Use read_note to read files.`,
    path,
    'Use read_note to read files, or list_directory to list directory contents.'
  );
}

/**
 * Factory: File already exists error.
 *
 * @param path - Path to the file that already exists
 * @returns DocumentError with ALREADY_EXISTS code
 * @example
 * throw alreadyExists('addendums/001-existing.md');
 * // DocumentError: File already exists: addendums/001-existing.md
 */
export function alreadyExists(path: string): DocumentError {
  return new DocumentError(
    'ALREADY_EXISTS',
    `File already exists: ${path}`,
    path,
    'Use update_doc to modify existing files.'
  );
}

/**
 * Factory: Permission denied error.
 *
 * @param path - Path to the file
 * @param reason - Reason for the permission denial
 * @param operation - Operation that was denied (read, write, delete, etc.)
 * @returns DocumentError with EACCES code
 * @example
 * throw permissionDenied('config.json', 'File is read-only', 'write');
 * // DocumentError: Permission denied: config.json. The file exists but cannot be written due to filesystem permissions.
 */
export function permissionDenied(path: string, reason?: string, operation?: string): DocumentError {
  const operationText = operation ? ` (${operation})` : '';
  const reasonText = reason ? `: ${reason}` : '';
  const message = `Permission denied${operationText}: ${path}${reasonText}. The file exists but cannot be ${operation || 'accessed'} due to filesystem permissions.`;

  return new DocumentError(
    'EACCES',
    message,
    path,
    'Check file permissions or ensure the file is not locked.'
  );
}

/**
 * Factory: Restricted path error.
 *
 * @param path - Path that is restricted
 * @returns DocumentError with RESTRICTED_PATH code
 * @example
 * throw restrictedPath('.git/config');
 * // DocumentError: Cannot access restricted path: .git/config
 */
export function restrictedPath(path: string): DocumentError {
  return new DocumentError(
    'RESTRICTED_PATH',
    `Cannot access restricted path: ${path}`,
    path,
    'Writable directories: addendums/, examples/, research/, and root *.md files.'
  );
}

/**
 * Factory: Validation error.
 *
 * @param field - Name of the field that failed validation
 * @param message - Description of the validation failure
 * @returns DocumentError with VALIDATION_ERROR code
 * @example
 * throw validationError('path', 'must be relative to repo root');
 * // DocumentError: Validation failed for 'path': must be relative to repo root
 */
export function validationError(field: string, message: string): DocumentError {
  return new DocumentError(
    'VALIDATION_ERROR',
    `Validation failed for '${field}': ${message}`,
    undefined,
    'Check the input format and try again.'
  );
}

/**
 * Factory: No space left on device error.
 *
 * @param path - Path where write failed
 * @returns DocumentError with ENOSPC code
 */
export function noSpaceError(path: string): DocumentError {
  return new DocumentError(
    'ENOSPC',
    `No space left on device: ${path}`,
    path,
    'Free up disk space and try again.'
  );
}

/**
 * Error thrown when recursion depth limit is exceeded.
 * Used by RLM sub-call processing.
 */
export class DepthLimitError extends Error {
  readonly maxDepth: number;
  readonly currentDepth: number;

  constructor(maxDepth: number, currentDepth: number) {
    super(`Max recursion depth exceeded: ${currentDepth} > ${maxDepth}`);
    this.name = 'DepthLimitError';
    this.maxDepth = maxDepth;
    this.currentDepth = currentDepth;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, DepthLimitError.prototype);

    // Capture stack trace (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DepthLimitError);
    }
  }
}

/**
 * Options for constructing a LimpsError.
 */
export interface LimpsErrorOptions {
  /** Error code for categorization */
  code?: string;
  /** Suggestions to help the user fix the issue */
  suggestions?: string[];
  /** Original error that caused this one */
  cause?: Error;
}

/**
 * Custom error class for CLI operations.
 * Extends Error with code, suggestions, and JSON serialization for --json output.
 */
export class LimpsError extends Error {
  readonly code: string;
  readonly suggestions: string[];

  constructor(message: string, options?: LimpsErrorOptions) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'LimpsError';
    this.code = options?.code ?? 'UNKNOWN_ERROR';
    this.suggestions = options?.suggestions ?? [];

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, LimpsError.prototype);

    // Capture stack trace (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LimpsError);
    }
  }

  /**
   * Convert to JSON envelope error format.
   */
  toJson(): JsonError {
    const result: JsonError = {
      success: false,
      error: this.message,
    };

    if (this.code !== 'UNKNOWN_ERROR') {
      result.code = this.code;
    }

    if (this.suggestions.length > 0) {
      result.suggestions = this.suggestions;
    }

    return result;
  }
}

/**
 * Factory: Task not found error with suggestions.
 *
 * @param taskId - The task ID that was not found
 * @param availableAgents - List of available agent identifiers for suggestions
 * @returns LimpsError with TASK_NOT_FOUND code and did-you-mean suggestions
 *
 * @example
 * throw taskNotFoundError('0001#999', ['0001#000', '0001#001', '0001#002']);
 */
export function taskNotFoundError(taskId: string, availableAgents: string[]): LimpsError {
  const similar = findSimilar(taskId, availableAgents, { maxDistance: 3, limit: 3 });
  const suggestions: string[] = [];

  if (similar.length > 0) {
    suggestions.push(`Did you mean: ${similar.join(', ')}?`);
  }

  if (availableAgents.length > 0 && availableAgents.length <= 5) {
    suggestions.push(`Available agents: ${availableAgents.join(', ')}`);
  } else if (availableAgents.length > 5) {
    suggestions.push(
      `Available agents: ${availableAgents.slice(0, 5).join(', ')} (and ${availableAgents.length - 5} more)`
    );
  }

  return new LimpsError(`Task not found: ${taskId}`, {
    code: 'TASK_NOT_FOUND',
    suggestions,
  });
}

/**
 * Factory: Plan not found error with suggestions.
 *
 * @param planId - The plan ID that was not found
 * @param availablePlans - List of available plan identifiers for suggestions
 * @returns LimpsError with PLAN_NOT_FOUND code and did-you-mean suggestions
 *
 * @example
 * throw planNotFoundError('99', ['0001-network-panel', '0002-auth-system']);
 */
export function planNotFoundError(planId: string, availablePlans: string[]): LimpsError {
  const similar = findSimilar(planId, availablePlans, { maxDistance: 3, limit: 3 });
  const suggestions: string[] = [];

  if (similar.length > 0) {
    suggestions.push(`Did you mean: ${similar.join(', ')}?`);
  }

  if (availablePlans.length > 0 && availablePlans.length <= 5) {
    suggestions.push(`Available plans: ${availablePlans.join(', ')}`);
  } else if (availablePlans.length > 5) {
    suggestions.push(
      `Available plans: ${availablePlans.slice(0, 5).join(', ')} (and ${availablePlans.length - 5} more)`
    );
  }

  return new LimpsError(`Plan not found: ${planId}`, {
    code: 'PLAN_NOT_FOUND',
    suggestions,
  });
}
