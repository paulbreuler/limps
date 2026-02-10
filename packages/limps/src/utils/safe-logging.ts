/**
 * Logging helpers that avoid writing potentially sensitive request payloads
 * (including prompt/response text) to persisted daemon logs.
 */

const SENSITIVE_TEXT_MARKERS = /\b(prompt|response|assistant|completion|messages?|content)\b/i;
const MAX_SAFE_MESSAGE_LENGTH = 240;

function safeString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return String(value);
  } catch {
    return 'unstringifiable';
  }
}

function getErrorCode(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybeCode = (value as { code?: unknown }).code;
  if (typeof maybeCode === 'string' || typeof maybeCode === 'number') {
    return safeString(maybeCode);
  }
  return null;
}

/**
 * Return a non-sensitive summary of an unknown value for logs.
 * Never includes raw payload content.
 */
export function summarizeForLog(value: unknown): string {
  if (value === null) return 'type=null';
  if (value === undefined) return 'type=undefined';
  if (value instanceof Error) {
    const code = getErrorCode(value);
    return code ? `type=Error name=${value.name} code=${code}` : `type=Error name=${value.name}`;
  }
  if (Array.isArray(value)) return `type=array len=${value.length}`;
  if (typeof value === 'string') return `type=string len=${value.length}`;
  if (typeof value === 'object') {
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
    return ctor ? `type=object ctor=${ctor}` : 'type=object';
  }
  return `type=${typeof value}`;
}

/**
 * Sanitize free-form text before writing to daemon logs.
 * If text looks like it could include AI payload data, redact it.
 */
export function sanitizeOperationalMessage(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return '[redacted-empty-message]';
  if (
    normalized.length > MAX_SAFE_MESSAGE_LENGTH ||
    normalized.includes('{') ||
    normalized.includes('[') ||
    SENSITIVE_TEXT_MARKERS.test(normalized)
  ) {
    return '[redacted-sensitive-message]';
  }
  return normalized;
}

/**
 * Sanitize console arguments before writing to persistent logs.
 * Strings are filtered for payload-like content; non-strings are summarized.
 */
export function sanitizeConsoleArguments(args: unknown[]): string[] {
  if (args.length === 0) {
    return ['[redacted-empty-message]'];
  }

  return args.map((arg) => {
    if (typeof arg === 'string') {
      return sanitizeOperationalMessage(arg);
    }
    return summarizeForLog(arg);
  });
}

/**
 * Log an event with non-sensitive error details.
 */
export function logRedactedError(prefix: string, value: unknown): void {
  console.error(`${prefix} (${summarizeForLog(value)})`);
}
