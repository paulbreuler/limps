/**
 * Input sanitization utilities for plan names, doc paths, and indexed content.
 *
 * Hardened to block path traversal, null-byte injection, and Unicode override
 * attacks before values reach filesystem operations or the FTS5 index.
 */

/**
 * Suspicious prompt-injection markers.
 * Scanning is non-blocking: logs a warning but never prevents indexing.
 */
const INJECTION_MARKERS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /system\s+prompt/i,
  /<\s*script\b/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /###\s*(System|Human|Assistant)\b/i,
];

/**
 * Unicode characters that can redirect rendering to disguise content.
 * Includes bidi-override (U+202E), zero-width space (U+200B), and BOM (U+FEFF).
 */
const DANGEROUS_UNICODE_RE = /[\u202E\u200B\uFEFF]/;

/** Shared guard: reject strings containing null bytes. */
function rejectNullBytes(value: string, label: string): void {
  if (value.includes('\0')) {
    throw new Error(`${label} must not contain null bytes`);
  }
}

/** Shared guard: reject strings that contain path-traversal segments. */
function rejectPathTraversal(value: string, label: string): void {
  const segments = value.split(/[\\/]/);
  if (segments.includes('..')) {
    throw new Error(`${label} must not contain path-traversal segments (..)`);
  }
}

/**
 * Sanitize a plan name supplied by the caller.
 *
 * Rules:
 * - No null bytes
 * - No path-traversal segments (`..`)
 * - Max 100 characters
 * - Normalises to lowercase slug (letters, digits, hyphens/underscores)
 *
 * @param name - Raw plan name from caller input
 * @returns Sanitized slug
 * @throws {Error} with a descriptive message when input is rejected
 */
export function sanitizePlanName(name: string): string {
  rejectNullBytes(name, 'Plan name');
  rejectPathTraversal(name, 'Plan name');

  if (name.length > 100) {
    throw new Error(`Plan name must not exceed 100 characters (got ${name.length})`);
  }

  // Normalise to slug: lowercase, keep alphanumeric, hyphens, underscores
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    throw new Error('Plan name is empty after sanitization');
  }

  return slug;
}

/**
 * Sanitize a document path supplied by the caller.
 *
 * Rules:
 * - No null bytes
 * - No bidi override / zero-width / BOM characters
 * - No path-traversal segments (`..`)
 *
 * The path is returned as-is (modulo trimming) because further validation
 * (symlink checks, containment checks) happens downstream in `validatePath`.
 *
 * @param docPath - Raw path from caller input
 * @returns Trimmed path if safe
 * @throws {Error} with a descriptive message when input is rejected
 */
export function sanitizeDocPath(docPath: string): string {
  rejectNullBytes(docPath, 'Document path');

  if (DANGEROUS_UNICODE_RE.test(docPath)) {
    throw new Error(
      'Document path contains dangerous Unicode characters (bidi-override or zero-width)'
    );
  }

  rejectPathTraversal(docPath, 'Document path');

  return docPath.trim();
}

/**
 * Scan document content for obvious prompt-injection markers.
 *
 * This is a non-blocking, best-effort defence. It logs a `console.error`
 * warning when suspicious content is detected but intentionally never
 * throws — indexing proceeds regardless so no legitimate content is lost.
 *
 * @param filePath - Absolute path of the file being indexed (for log context)
 * @param content - Full text content of the document
 */
export function scanForInjection(filePath: string, content: string): void {
  for (const pattern of INJECTION_MARKERS) {
    if (pattern.test(content)) {
      console.error(
        `[limps] Potential prompt-injection marker detected in file: ${filePath} (pattern: ${pattern.source})`
      );
      // Do not throw — indexing continues
      return;
    }
  }
}
