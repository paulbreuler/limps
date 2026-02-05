export interface ParsedFrontmatter {
  title?: string;
  status?: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED' | 'draft';
  depends?: string[];
  files?: string[];
  tags?: string[];
  persona?: string;
}

function parseArray(str: string): string[] {
  return str
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter((part) => part.length > 0);
}

function normalizeStatus(value: string): ParsedFrontmatter['status'] | undefined {
  const normalized = value.trim();
  if (normalized === 'draft') {
    return 'draft';
  }

  const upper = normalized.toUpperCase();
  if (upper === 'GAP' || upper === 'WIP' || upper === 'PASS' || upper === 'BLOCKED') {
    return upper;
  }

  return undefined;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !match[1]) {
    return {};
  }

  const yaml = match[1];
  const result: ParsedFrontmatter = {};

  const titleMatch = yaml.match(/^title:\s*(.+)$/m);
  if (titleMatch?.[1]) {
    result.title = titleMatch[1].trim();
  }

  const statusMatch = yaml.match(/^status:\s*(\w+)$/m);
  if (statusMatch?.[1]) {
    const normalized = normalizeStatus(statusMatch[1]);
    if (normalized) {
      result.status = normalized;
    }
  }

  const personaMatch = yaml.match(/^persona:\s*(\w+)$/m);
  if (personaMatch?.[1]) {
    result.persona = personaMatch[1].trim();
  }

  const dependsMatch = yaml.match(/^(?:depends|depends_on):\s*\[([^\]]*)\]/m);
  if (dependsMatch?.[1]) {
    result.depends = parseArray(dependsMatch[1]);
  }

  const filesMatch = yaml.match(/^files:\s*\[([^\]]*)\]/m);
  if (filesMatch?.[1]) {
    result.files = parseArray(filesMatch[1]);
  }

  const tagsMatch = yaml.match(/^tags:\s*\[([^\]]*)\]/m);
  if (tagsMatch?.[1]) {
    result.tags = parseArray(tagsMatch[1]);
  }

  return result;
}
