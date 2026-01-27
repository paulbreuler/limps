/**
 * Lower-level parsing utilities for document extraction.
 * Feature #3: Built-in Helper Functions (extractors layer)
 *
 * These are pure functions used by helpers.ts for parsing markdown, YAML, and Gherkin.
 */

import { FrontmatterHandler } from '../utils/frontmatter.js';

// Create a singleton FrontmatterHandler instance
const frontmatterHandler = new FrontmatterHandler();

/**
 * Parse markdown headers from content.
 * Returns array of headers with level (1-6), text, and line number (1-indexed).
 *
 * @param content - Markdown content
 * @returns Array of header objects
 */
export function parseMarkdownHeaders(
  content: string
): { level: number; text: string; line: number }[] {
  const headers: { level: number; text: string; line: number }[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);

    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headers.push({
        level,
        text,
        line: i + 1, // 1-indexed
      });
    }
  }

  return headers;
}

/**
 * Parse YAML frontmatter from content.
 * Frontmatter must be at the very start of the file (no leading whitespace).
 * Returns parsed YAML object or null if no valid frontmatter found.
 * Uses FrontmatterHandler for robust parsing (supports Obsidian properties).
 *
 * @param content - Content with optional YAML frontmatter
 * @returns Parsed YAML object or null
 */
export function parseYamlFrontmatter(content: string): Record<string, unknown> | null {
  try {
    const parsed = frontmatterHandler.parse(content);
    // Return null if no frontmatter was found (empty object means no frontmatter)
    if (Object.keys(parsed.frontmatter).length === 0) {
      // Check if there was actually frontmatter delimiters
      // Handles both empty frontmatter (---\n---\n) and frontmatter with content
      const hasFrontmatter = content.match(/^---\s*\n([\s\S]*?\n)?---\s*(\n|$)/);
      if (!hasFrontmatter) {
        return null; // No valid frontmatter structure
      }
    }
    return parsed.frontmatter;
  } catch (_error) {
    // Return null on error (caller should handle this gracefully)
    // Note: We don't log here to avoid console noise in RLM sandbox context
    // The indexer.ts will log errors for document indexing
    return null;
  }
}

/**
 * Parse Gherkin scenarios from content.
 * Returns array of scenarios with name and steps array.
 *
 * @param content - Content containing Gherkin scenarios
 * @returns Array of scenario objects
 */
export function parseGherkinScenarios(content: string): { name: string; steps: string[] }[] {
  const scenarios: { name: string; steps: string[] }[] = [];
  const lines = content.split('\n');

  let currentScenario: { name: string; steps: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for Scenario: line
    const scenarioMatch = trimmed.match(/^Scenario:\s*(.+)$/i);
    if (scenarioMatch) {
      // Save previous scenario if exists
      if (currentScenario) {
        scenarios.push(currentScenario);
      }

      // Start new scenario
      currentScenario = {
        name: scenarioMatch[1].trim(),
        steps: [],
      };
      continue;
    }

    // Check for step keywords (Given, When, Then, And, But)
    const stepMatch = trimmed.match(/^(Given|When|Then|And|But)\s+(.+)$/i);
    if (stepMatch) {
      if (currentScenario) {
        currentScenario.steps.push(trimmed);
      }
      continue;
    }

    // If we have a scenario and this line is not empty and not a step,
    // it might be part of a step continuation (for now, we ignore it)
    // In a full Gherkin parser, we'd handle step continuations
  }

  // Don't forget the last scenario
  if (currentScenario) {
    scenarios.push(currentScenario);
  }

  return scenarios;
}
