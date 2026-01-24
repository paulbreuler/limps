/**
 * Error handling utilities for MCP document CRUD operations.
 * Provides consistent error types with codes, suggestions, and JSON serialization.
 */

/**
 * Error codes for document operations.
 */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'VALIDATION_ERROR'
  | 'RESTRICTED_PATH'
  | 'INTERNAL_ERROR';

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
 * @returns DocumentError with NOT_FOUND code
 * @example
 * throw notFound('research/missing.md');
 * // DocumentError: File not found: research/missing.md
 */
export function notFound(path: string): DocumentError {
  return new DocumentError(
    'NOT_FOUND',
    `File not found: ${path}`,
    path,
    'Use create_doc to create a new file, or check that the path is correct.'
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
 * @returns DocumentError with PERMISSION_DENIED code
 * @example
 * throw permissionDenied('config.json', 'File is read-only');
 * // DocumentError: Permission denied for config.json: File is read-only
 */
export function permissionDenied(path: string, reason: string): DocumentError {
  return new DocumentError(
    'PERMISSION_DENIED',
    `Permission denied for ${path}: ${reason}`,
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
  return new DocumentError('VALIDATION_ERROR', `Validation failed for '${field}': ${message}`);
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
