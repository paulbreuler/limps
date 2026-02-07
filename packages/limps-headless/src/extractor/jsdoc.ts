/**
 * JSDoc extraction utilities.
 */

import type { JSDoc, PropertySignature } from 'ts-morph';

export interface JsDocInfo {
  description?: string;
  defaultValue?: string;
  deprecated?: boolean;
  see?: string[];
  example?: string;
}

/**
 * Extract JSDoc information from a property.
 */
export function extractJsDoc(prop: PropertySignature): JsDocInfo {
  const jsDocs = prop.getJsDocs();
  if (jsDocs.length === 0) {
    return {};
  }

  const result: JsDocInfo = {};
  const doc = jsDocs[0];

  // Get main description
  const description = doc.getDescription();
  if (description) {
    result.description = description.trim();
  }

  // Parse tags
  for (const tag of doc.getTags()) {
    const tagName = tag.getTagName();
    const text = tag.getText();

    switch (tagName) {
      case 'default':
      case 'defaultValue':
        result.defaultValue = extractTagValue(text);
        break;
      case 'deprecated':
        result.deprecated = true;
        break;
      case 'see':
        result.see = result.see || [];
        result.see.push(extractTagValue(text));
        break;
      case 'example':
        result.example = extractTagValue(text);
        break;
    }
  }

  return result;
}

/**
 * Extract @default value from JSDoc comment text.
 * Handles formats like:
 * - @default "value"
 * - @default `value`
 * - @default value
 */
export function extractDefaultFromComment(jsDocs: JSDoc[]): string | undefined {
  for (const doc of jsDocs) {
    for (const tag of doc.getTags()) {
      const tagName = tag.getTagName();
      if (tagName === 'default' || tagName === 'defaultValue') {
        return extractTagValue(tag.getText());
      }
    }
  }
  return undefined;
}

/**
 * Extract the value from a JSDoc tag text.
 */
function extractTagValue(text: string): string {
  // Remove the @tagName part
  const value = text.replace(/^@\w+\s*/, '').trim();

  // Remove surrounding quotes or backticks
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('`') && value.endsWith('`'))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
