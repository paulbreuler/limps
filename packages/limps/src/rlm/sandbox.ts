/**
 * Sandboxed JavaScript execution environment for RLM queries.
 * Feature #1: RLM Environment Core
 *
 * Uses QuickJS via quickjs-emscripten for true sandboxing.
 */

import {
  getQuickJS,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from 'quickjs-emscripten';
import { validateCode } from './security.js';
import { getHelpersCode } from './helpers-inject.js';

/**
 * Document representation in RLM environment.
 */
export interface DocVariable {
  content: string;
  metadata: {
    path: string;
    size: number;
    lines: number;
    modified: string;
  };
  path: string;
}

/**
 * Sandbox configuration options.
 */
export interface SandboxOptions {
  /** Execution timeout in ms (default: 5000) */
  timeout?: number;
  /** Memory limit in MB (default: 64) */
  memoryLimit?: number;
}

/**
 * Result of code execution.
 */
export interface ExecutionResult<T> {
  result: T;
  executionTimeMs: number;
  memoryUsed?: number;
}

/**
 * Timeout error thrown when execution exceeds time limit.
 */
export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Execution timeout after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Memory error thrown when execution exceeds memory limit.
 */
export class MemoryError extends Error {
  constructor(limitMb: number) {
    super(`Memory limit exceeded (${limitMb}MB)`);
    this.name = 'MemoryError';
    Object.setPrototypeOf(this, MemoryError.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MemoryError);
    }
  }
}

/**
 * Sandboxed RLM execution environment.
 */
export interface RlmEnvironment {
  /**
   * Execute JavaScript code with doc/docs variable available.
   * @param code - JavaScript code to execute
   * @returns Promise resolving to execution result
   * @throws TimeoutError if execution exceeds timeout
   * @throws MemoryError if execution exceeds memory limit
   * @throws SecurityError if code attempts prohibited operations
   */
  execute<T>(code: string): Promise<ExecutionResult<T>>;

  /**
   * Release resources. Always call when done.
   */
  dispose(): void;
}

/**
 * Sanitize error messages: strip HTML-like tags and truncate to 500 chars.
 */
function sanitizeErrorMessage(msg: string): string {
  const stripped = msg.replace(/<[^>]*>/g, '');
  return stripped.length > 500 ? stripped.slice(0, 500) + '...' : stripped;
}

// Cached QuickJS module
let quickJSModule: QuickJSWASMModule | null = null;

/**
 * Get or initialize the QuickJS WASM module.
 */
async function getQuickJSModule(): Promise<QuickJSWASMModule> {
  if (!quickJSModule) {
    quickJSModule = await getQuickJS();
  }
  return quickJSModule;
}

/**
 * Default sandbox options.
 */
const DEFAULT_OPTIONS: Required<SandboxOptions> = {
  timeout: 5000,
  memoryLimit: 64,
};

/**
 * Create a sandboxed execution environment with document(s) loaded.
 * @param doc - Single DocVariable or array for multi-query
 * @param options - Sandbox configuration
 */
export async function createEnvironment(
  doc: DocVariable | DocVariable[],
  options?: SandboxOptions
): Promise<RlmEnvironment> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const QuickJS = await getQuickJSModule();

  // Create runtime with memory limit
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(opts.memoryLimit * 1024 * 1024); // Convert MB to bytes
  runtime.setMaxStackSize(1024 * 1024); // 1MB stack

  // Create context
  const context = runtime.newContext();

  // Set up doc/docs globals
  const isArray = Array.isArray(doc);
  const docData = isArray ? doc : doc;

  // Inject helper functions first
  const helpersCode = getHelpersCode();
  const helpersResult = context.evalCode(helpersCode);
  if (helpersResult.error) {
    const errorMsg = context.dump(helpersResult.error);
    helpersResult.error.dispose();
    context.dispose();
    runtime.dispose();
    throw new Error(`Failed to inject helpers: ${String(errorMsg)}`);
  }
  helpersResult.value.dispose();

  // Inject the document data as JSON and parse it in the sandbox
  const docJson = JSON.stringify(docData);
  const setupCode = isArray
    ? `const docs = ${docJson}; const doc = docs[0];`
    : `const doc = ${docJson};`;

  const setupResult = context.evalCode(setupCode);
  if (setupResult.error) {
    const errorMsg = context.dump(setupResult.error);
    setupResult.error.dispose();
    context.dispose();
    runtime.dispose();
    throw new Error(`Failed to initialize environment: ${String(errorMsg)}`);
  }
  setupResult.value.dispose();

  let disposed = false;

  return {
    async execute<T>(code: string): Promise<ExecutionResult<T>> {
      if (disposed) {
        throw new Error('Environment has been disposed');
      }

      // Validate code for security
      validateCode(code);

      const startTime = performance.now();

      // Set up interrupt handler for timeout
      const deadline = Date.now() + opts.timeout;
      runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));

      // Evaluate the code directly - QuickJS returns the last expression value
      const result = context.evalCode(code);

      const executionTimeMs = performance.now() - startTime;

      // Check for errors
      if (result.error) {
        const errorDump = context.dump(result.error);
        result.error.dispose();

        // Handle the error dump - it could be an object with message property
        let errorStr: string;
        if (typeof errorDump === 'object' && errorDump !== null) {
          const errorObj = errorDump as Record<string, unknown>;
          errorStr = errorObj.message
            ? String(errorObj.message)
            : errorObj.name
              ? String(errorObj.name)
              : JSON.stringify(errorDump);
        } else {
          errorStr = String(errorDump);
        }

        // Check if it's an interrupt (timeout)
        if (
          errorStr.includes('interrupted') ||
          errorStr.includes('InternalError') ||
          errorStr.includes('stack') // QuickJS throws stack overflow on interrupt
        ) {
          throw new TimeoutError(opts.timeout);
        }

        // Check if it's a memory error
        if (
          errorStr.includes('out of memory') ||
          errorStr.includes('memory') ||
          errorStr.includes('allocation')
        ) {
          throw new MemoryError(opts.memoryLimit);
        }

        throw new Error(`Execution error: ${sanitizeErrorMessage(errorStr)}`);
      }

      // Get result value
      const value = context.dump(result.value) as T;
      result.value.dispose();

      return {
        result: value,
        executionTimeMs,
      };
    },

    dispose(): void {
      if (!disposed) {
        disposed = true;
        context.dispose();
        runtime.dispose();
      }
    },
  };
}
