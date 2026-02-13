export interface ParsedDependencyRef {
  planId?: string;
  agentNumber: string;
}

function stripOuterQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function extractMarkdownTarget(value: string): string {
  const markdown = value.match(/^\[[^\]]*]\(([^)]+)\)$/);
  if (markdown?.[1]) {
    return markdown[1].trim();
  }

  const wikilink = value.match(/^\[\[([^\]]+)\]\]$/);
  if (wikilink?.[1]) {
    const noAlias = wikilink[1].split('|')[0];
    return (noAlias ?? '').trim();
  }

  return value;
}

function extractAgentFromPath(value: string): string | null {
  const clean = value.split('?')[0]?.split('#')[0] ?? value;
  const fileName = clean.split(/[\\/]/).pop() ?? '';
  const match = fileName.match(/^(\d{1,3})(?=[^0-9]|$)/);
  if (!match?.[1]) {
    return null;
  }
  return match[1].padStart(3, '0');
}

export function parseDependencyRef(value: unknown): ParsedDependencyRef | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { agentNumber: String(value).padStart(3, '0') };
  }

  if (typeof value !== 'string') {
    return null;
  }

  const raw = stripOuterQuotes(value);
  if (!raw) {
    return null;
  }

  const token = extractMarkdownTarget(raw);

  const canonicalAgent = token.match(/^agent:(\d{4})#(\d{1,3})$/i);
  if (canonicalAgent?.[1] && canonicalAgent[2]) {
    return {
      planId: canonicalAgent[1],
      agentNumber: canonicalAgent[2].padStart(3, '0'),
    };
  }

  const explicitPlan = token.match(/^(\d{4})#(\d{1,3})$/);
  if (explicitPlan?.[1] && explicitPlan[2]) {
    return {
      planId: explicitPlan[1],
      agentNumber: explicitPlan[2].padStart(3, '0'),
    };
  }

  if (/^\d{1,3}$/.test(token)) {
    return { agentNumber: token.padStart(3, '0') };
  }

  const fromPath = extractAgentFromPath(token);
  if (fromPath) {
    return { agentNumber: fromPath };
  }

  return null;
}
