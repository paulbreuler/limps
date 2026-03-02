import { stringify } from 'yaml';

export function serializeFrontmatter(fm: Record<string, unknown>): string {
  const yaml = stringify(fm, { lineWidth: 0 });
  return `---\n${yaml}---\n`;
}

export function serializeDocument(fm: Record<string, unknown>, body: string): string {
  return `${serializeFrontmatter(fm)}\n${body}`;
}
