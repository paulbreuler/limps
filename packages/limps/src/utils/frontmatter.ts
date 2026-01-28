/**
 * Frontmatter handling utilities with validation.
 * Based on patterns from mcp-obsidian for safe YAML frontmatter parsing.
 */

import matter from 'gray-matter';

/**
 * Parsed note with frontmatter and content separated.
 */
export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  content: string;
  originalContent: string;
}

/**
 * Result of frontmatter validation.
 */
export interface FrontmatterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Frontmatter handler with validation and safe parsing.
 * Prevents functions, symbols, and other dangerous objects in frontmatter.
 */
export class FrontmatterHandler {
  /**
   * Parse frontmatter from content.
   * Returns parsed frontmatter and content separated.
   *
   * @param content - Content with optional YAML frontmatter
   * @returns Parsed note with frontmatter and content
   */
  parse(content: string): ParsedNote {
    try {
      const parsed = matter(content);
      return {
        frontmatter: parsed.data,
        content: parsed.content,
        originalContent: content,
      };
    } catch (_error) {
      // If parsing fails, treat as content without frontmatter
      return {
        frontmatter: {},
        content: content,
        originalContent: content,
      };
    }
  }

  /**
   * Stringify frontmatter and content back to markdown.
   *
   * @param frontmatterData - Frontmatter object
   * @param content - Content body
   * @returns Complete markdown with frontmatter
   */
  stringify(frontmatterData: Record<string, unknown>, content: string): string {
    try {
      // If no frontmatter, return content as-is
      if (!frontmatterData || Object.keys(frontmatterData).length === 0) {
        return content;
      }

      return matter.stringify(content, frontmatterData);
    } catch (error) {
      throw new Error(
        `Failed to stringify frontmatter: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate frontmatter for security and correctness.
   * Prevents functions, symbols, and other dangerous objects.
   *
   * @param frontmatterData - Frontmatter object to validate
   * @returns Validation result with errors and warnings
   */
  validate(frontmatterData: Record<string, unknown>): FrontmatterValidationResult {
    const result: FrontmatterValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Test if the frontmatter can be serialized to valid YAML using gray-matter
      matter.stringify('', frontmatterData);
    } catch (error) {
      result.isValid = false;
      result.errors.push(
        `Invalid YAML structure: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Check for problematic values
    this.checkForProblematicValues(frontmatterData, result, '');

    return result;
  }

  /**
   * Recursively check for problematic values in frontmatter.
   *
   * @param obj - Object to check
   * @param result - Validation result to update
   * @param path - Current path in the object (for error messages)
   */
  private checkForProblematicValues(
    obj: unknown,
    result: FrontmatterValidationResult,
    path: string
  ): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (typeof obj === 'function') {
      result.errors.push(`Functions are not allowed in frontmatter at path: ${path}`);
      result.isValid = false;
      return;
    }

    if (typeof obj === 'symbol') {
      result.errors.push(`Symbols are not allowed in frontmatter at path: ${path}`);
      result.isValid = false;
      return;
    }

    if (obj instanceof Date) {
      // Dates are fine, but warn if they're invalid
      if (isNaN(obj.getTime())) {
        result.warnings.push(`Invalid date at path: ${path}`);
      }
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.checkForProblematicValues(item, result, `${path}[${index}]`);
      });
      return;
    }

    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Check for problematic keys
        if (typeof key !== 'string') {
          result.errors.push(`Non-string keys are not allowed: ${key}`);
          result.isValid = false;
        }

        this.checkForProblematicValues(value, result, currentPath);
      }
    }
  }

  /**
   * Extract only frontmatter from content without parsing body.
   *
   * @param content - Content with optional YAML frontmatter
   * @returns Frontmatter object
   */
  extractFrontmatter(content: string): Record<string, unknown> {
    const parsed = this.parse(content);
    return parsed.frontmatter;
  }

  /**
   * Update frontmatter in content, preserving body.
   *
   * @param content - Original content
   * @param updates - Frontmatter updates to merge
   * @returns Updated content with new frontmatter
   */
  updateFrontmatter(content: string, updates: Record<string, unknown>): string {
    const parsed = this.parse(content);
    const updatedFrontmatter = { ...parsed.frontmatter, ...updates };

    const validation = this.validate(updatedFrontmatter);
    if (!validation.isValid) {
      throw new Error(`Invalid frontmatter: ${validation.errors.join(', ')}`);
    }

    return this.stringify(updatedFrontmatter, parsed.content);
  }
}
