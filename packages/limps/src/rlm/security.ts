/**
 * Security validation for RLM sandbox execution.
 * Feature #6: Security Sandbox
 *
 * Blocks dangerous APIs and validates code before execution.
 * This is defense-in-depth; isolated-vm provides true isolation.
 */

/**
 * APIs that are blocked from sandbox execution.
 * These are validated via static analysis before code runs.
 */
export const BLOCKED_APIS: readonly string[] = [
  'require',
  'import',
  'eval',
  'Function',
  'process',
  'global',
  'globalThis',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'Buffer',
  'ArrayBuffer.transfer',
  '__proto__',
  'constructor.constructor',
] as const;

/**
 * Security error thrown when code contains prohibited operations.
 */
export class SecurityError extends Error {
  readonly violation: string;

  constructor(violation: string, message: string) {
    super(message);
    this.name = 'SecurityError';
    this.violation = violation;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, SecurityError.prototype);

    // Capture stack trace (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityError);
    }
  }
}

/**
 * Patterns to detect blocked APIs.
 * Each entry maps a violation type to its detection pattern and error message.
 * Note: Using an array instead of an object to avoid issues with '__proto__' as a key.
 */
interface ViolationRule {
  violation: string;
  pattern: RegExp;
  message: string;
}

const VIOLATION_RULES: ViolationRule[] = [
  {
    violation: 'require',
    pattern: /\brequire\b/,
    message: 'Prohibited module access',
  },
  {
    violation: 'import',
    pattern: /\bimport\b/,
    message: 'Dynamic import not allowed',
  },
  {
    violation: 'eval',
    pattern: /\beval\b/,
    message: 'Dynamic code execution',
  },
  {
    violation: 'Function',
    pattern: /\bFunction\b/,
    message: 'Dynamic code execution',
  },
  {
    violation: 'process',
    pattern: /\bprocess\b/,
    message: 'Process access not allowed',
  },
  {
    violation: 'global',
    pattern: /\bglobal\b(?!This)/,
    message: 'Global access not allowed',
  },
  {
    violation: 'globalThis',
    pattern: /\bglobalThis\b/,
    message: 'Global access not allowed',
  },
  {
    violation: 'fetch',
    pattern: /\bfetch\b/,
    message: 'Network access not allowed',
  },
  {
    violation: 'XMLHttpRequest',
    pattern: /\bXMLHttpRequest\b/,
    message: 'Network access not allowed',
  },
  {
    violation: 'WebSocket',
    pattern: /\bWebSocket\b/,
    message: 'Network access not allowed',
  },
  {
    violation: 'setTimeout',
    pattern: /\bsetTimeout\b/,
    message: 'Timer functions not allowed',
  },
  {
    violation: 'setInterval',
    pattern: /\bsetInterval\b/,
    message: 'Timer functions not allowed',
  },
  {
    violation: 'setImmediate',
    pattern: /\bsetImmediate\b/,
    message: 'Timer functions not allowed',
  },
  {
    violation: 'Buffer',
    pattern: /\bBuffer\b/,
    message: 'Buffer access not allowed',
  },
  {
    violation: 'ArrayBuffer.transfer',
    pattern: /ArrayBuffer\s*\.\s*transfer/,
    message: 'ArrayBuffer.transfer not allowed',
  },
  {
    violation: '__proto__',
    pattern: /__proto__/,
    message: 'Prototype pollution',
  },
  {
    violation: 'constructor.constructor',
    pattern: /constructor\s*\.\s*constructor/,
    message: 'Prototype pollution',
  },
];

/**
 * Pre-execution validation of code string.
 * Scans for BLOCKED_APIS patterns and throws SecurityError if found.
 *
 * @param code - JavaScript code to validate
 * @throws SecurityError if code contains blocked patterns
 */
export function validateCode(code: string): void {
  // Empty or whitespace-only code is allowed
  if (!code.trim()) {
    return;
  }

  // Check each violation rule
  for (const rule of VIOLATION_RULES) {
    if (rule.pattern.test(code)) {
      throw new SecurityError(rule.violation, rule.message);
    }
  }
}
