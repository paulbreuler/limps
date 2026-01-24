/**
 * Lower-level parsing utilities for document extraction.
 * Feature #3: Built-in Helper Functions (extractors layer)
 *
 * These are pure functions used by helpers.ts for parsing markdown, YAML, and Gherkin.
 */

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
 *
 * @param content - Content with optional YAML frontmatter
 * @returns Parsed YAML object or null
 */
export function parseYamlFrontmatter(content: string): Record<string, unknown> | null {
  // Frontmatter must be at very start (no leading whitespace)
  if (!content.startsWith('---\n')) {
    return null;
  }

  // Find the closing ---
  // Look for \n---\n (most common case) or ---\n at start (empty frontmatter)
  let endIndex = content.indexOf('\n---\n', 4); // Start search after first ---\n

  // If not found, check if the next thing is ---\n (empty frontmatter case)
  if (endIndex === -1) {
    if (content.slice(4, 8) === '---\n') {
      // Empty frontmatter: ---\n---\n
      endIndex = 4; // The second --- starts at index 4
    } else {
      return null; // No closing delimiter
    }
  } else {
    // Found \n---\n, so the actual --- starts at endIndex + 1
    endIndex = endIndex + 1; // Adjust to point to the start of ---
  }

  // Extract YAML content (between first ---\n and second ---\n)
  const yamlContent = content.slice(4, endIndex); // Skip "---\n"

  // Handle empty frontmatter
  if (yamlContent.trim() === '') {
    return {};
  }

  // Simple YAML parser for common cases
  // For production, consider using a YAML library, but for now we'll do basic parsing
  try {
    return parseSimpleYaml(yamlContent);
  } catch {
    return null;
  }
}

/**
 * Simple YAML parser for frontmatter.
 * Handles key-value pairs, nested objects, arrays, and multiline strings.
 * This is a simplified parser - for complex YAML, consider using a library.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const trimmedYaml = yaml.trim();

  // Handle empty frontmatter
  if (trimmedYaml === '') {
    return {};
  }

  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  const stack: { obj: Record<string, unknown>; indent: number; key?: string }[] = [
    { obj: result, indent: -1 },
  ];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // Calculate indentation
    const indent = line.length - line.trimStart().length;

    // Pop stack until we find the right parent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    // Check for multiline string (| or >)
    if (trimmed.endsWith('|') || trimmed.endsWith('>')) {
      const keyMatch = trimmed.match(/^([^:]+):\s*([|>])$/);
      if (keyMatch) {
        const key = keyMatch[1].trim();
        const multilineType = keyMatch[2];
        const multilineContent: string[] = [];
        i++;

        // Collect multiline content
        while (i < lines.length) {
          const nextLine = lines[i];
          const nextIndent = nextLine.length - nextLine.trimStart().length;
          const nextTrimmed = nextLine.trim();

          // Stop if we hit a line with same or less indentation (not part of multiline)
          if (nextIndent <= indent && nextTrimmed !== '') {
            break;
          }

          // For | (literal), preserve newlines; for > (folded), fold newlines
          if (multilineType === '|') {
            // Preserve the line content, removing the indentation
            if (nextIndent > indent) {
              // Remove the base indentation (key's indent level)
              const baseIndent = indent + 2; // Key is at indent, content is at indent+2
              const contentLine = nextLine.slice(baseIndent);
              multilineContent.push(contentLine);
            } else if (nextTrimmed === '') {
              // Empty line in literal block
              multilineContent.push('');
            }
          } else {
            // Folded: replace newlines with spaces, but preserve paragraph breaks
            if (nextTrimmed === '') {
              multilineContent.push('\n');
            } else {
              multilineContent.push(nextTrimmed + ' ');
            }
          }
          i++;
        }

        // For literal (|), join with newlines
        // YAML spec: literal blocks preserve newlines and add a final newline
        let finalContent =
          multilineType === '|' ? multilineContent.join('\n') : multilineContent.join('').trim();

        // For literal blocks, ensure there's a trailing newline (YAML spec)
        if (multilineType === '|' && !finalContent.endsWith('\n')) {
          finalContent += '\n';
        }

        current.obj[key] = finalContent;
        continue;
      }
    }

    // Check for array item
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();

      // Find the array - look for the most recent key in stack that has an array
      let arrayFound = false;
      for (let j = stack.length - 1; j >= 0; j--) {
        const stackItem = stack[j];
        if (stackItem.key && Array.isArray(stackItem.obj[stackItem.key])) {
          (stackItem.obj[stackItem.key] as unknown[]).push(parseValue(value));
          arrayFound = true;
          break;
        }
      }

      // If no array found, this shouldn't happen in valid YAML, but handle gracefully
      if (!arrayFound) {
        // This is a malformed YAML - skip it
      }

      i++;
      continue;
    }

    // Regular key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const valueStr = trimmed.slice(colonIndex + 1).trim();

    // Check if this starts a nested object
    if (valueStr === '' && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextIndent = nextLine.length - nextLine.trimStart().length;
      const nextTrimmed = nextLine.trim();

      if (nextIndent > indent) {
        // Check if next line is an array item
        if (nextTrimmed.startsWith('- ')) {
          // This is an array
          const array: unknown[] = [];
          current.obj[key] = array;
          // Push a stack entry that tracks this array
          stack.push({ obj: current.obj, indent: indent, key: key });
          i++;
          continue;
        } else {
          // This is a nested object
          const nestedObj: Record<string, unknown> = {};
          current.obj[key] = nestedObj;
          stack.push({ obj: nestedObj, indent: indent });
          i++;
          continue;
        }
      }
    }

    current.obj[key] = parseValue(valueStr);
    i++;
  }

  return result;
}

/**
 * Parse a YAML value string into appropriate JavaScript type.
 */
function parseValue(value: string): unknown {
  const trimmed = value.trim();

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Null
  if (trimmed === 'null' || trimmed === '~') return null;

  // Number
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);

  // String (remove quotes if present)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
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
