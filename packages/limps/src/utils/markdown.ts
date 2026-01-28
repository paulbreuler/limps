/**
 * Utility functions for markdown text processing.
 */

import removeMarkdown from 'remove-markdown';

/**
 * Strip all markdown syntax from text, converting it to plain text.
 * Uses the remove-markdown library for reliable markdown removal.
 *
 * This is for CLI display - LLM processing happens elsewhere
 * and should receive full markdown.
 *
 * @param text - Markdown text to strip
 * @returns Plain text without markdown syntax
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return removeMarkdown(text).trim();
}
