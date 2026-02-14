import { linter, type Action, type Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type LimpsPlugin from '../main.js';

interface LinkOccurrence {
  token: string;
  from: number;
  to: number;
}

const MARKDOWN_LINK_REGEX = /(?<!!)\[[^\]]*]\(([^)]+)\)/g;
const WIKILINK_REGEX = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?]]/g;

function canonicalizeToken(raw: string): string {
  const noFragment = raw.split('#')[0] ?? raw;
  const noQuery = noFragment.split('?')[0] ?? noFragment;
  return noQuery.trim().replace(/^\.\/+/, '').replace(/\\/g, '/');
}

function isExternalOrPlaceholder(token: string): boolean {
  const value = token.trim().toLowerCase();
  if (!value) return true;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('mailto:')) return true;
  if (value.startsWith('obsidian://')) return true;
  if (value.startsWith('#')) return true;
  if (value.endsWith('/')) return true;
  if (value === 'path.md' || value === 'file.md' || value === 'example.md') return true;
  if (value.startsWith('<') || value.includes('{') || value.includes('}')) return true;
  return false;
}

function findLinkOccurrences(content: string): LinkOccurrence[] {
  const links: LinkOccurrence[] = [];

  let markdownMatch: RegExpExecArray | null;
  while ((markdownMatch = MARKDOWN_LINK_REGEX.exec(content)) !== null) {
    const token = markdownMatch[1]?.trim();
    if (!token) continue;
    const tokenIndex = markdownMatch[0].lastIndexOf(`(${markdownMatch[1]}`);
    if (tokenIndex < 0) continue;
    const from = markdownMatch.index + tokenIndex + 1;
    links.push({ token, from, to: from + token.length });
  }

  let wikilinkMatch: RegExpExecArray | null;
  while ((wikilinkMatch = WIKILINK_REGEX.exec(content)) !== null) {
    const token = wikilinkMatch[1]?.trim();
    if (!token) continue;
    const from = wikilinkMatch.index + 2;
    links.push({ token, from, to: from + token.length });
  }

  return links;
}

function stripPlansPrefix(token: string): string {
  if (token.startsWith('/plans/')) return token.slice('/plans/'.length);
  if (token.startsWith('plans/')) return token.slice('plans/'.length);
  return token;
}

export function buildUnresolvedLinkDiagnostics(
  content: string,
  unresolvedTokens: string[],
  onOpenGraph: () => void
): Diagnostic[] {
  if (unresolvedTokens.length === 0) return [];

  const unresolved = new Set(
    unresolvedTokens
      .map(canonicalizeToken)
      .filter((token) => token.length > 0 && !isExternalOrPlaceholder(token))
  );
  if (unresolved.size === 0) return [];

  const diagnostics: Diagnostic[] = [];
  const occurrences = findLinkOccurrences(content);
  for (const occurrence of occurrences) {
    const canonical = canonicalizeToken(occurrence.token);
    if (!unresolved.has(canonical)) continue;

    const replacement = stripPlansPrefix(occurrence.token);
    const actions: Action[] = [
      {
        name: 'Open LIMPS Graph',
        apply: () => {
          onOpenGraph();
        },
      },
    ];

    if (replacement !== occurrence.token) {
      actions.unshift({
        name: 'Strip /plans prefix',
        apply: (view: EditorView) => {
          view.dispatch({
            changes: { from: occurrence.from, to: occurrence.to, insert: replacement },
          });
        },
      });
    }

    diagnostics.push({
      from: occurrence.from,
      to: occurrence.to,
      severity: 'warning',
      message: `Unresolved link '${occurrence.token}'`,
      actions,
    });
  }

  return diagnostics.slice(0, 80);
}

export function createLimpsEditorDiagnosticsExtension(plugin: LimpsPlugin): Extension {
  return linter((view: EditorView) => {
    const workspace = plugin.app.workspace as { getActiveFile?: () => { path: string } | null };
    const activePath = workspace.getActiveFile?.()?.path;
    if (!activePath) return [];

    const unresolvedMap = plugin.app.metadataCache?.unresolvedLinks?.[activePath];
    if (!unresolvedMap) return [];
    const unresolvedTokens = Object.keys(unresolvedMap);
    if (unresolvedTokens.length === 0) return [];

    return buildUnresolvedLinkDiagnostics(view.state.doc.toString(), unresolvedTokens, () => {
      void plugin.openDirectedGraphView();
    });
  }, { delay: 450 });
}
