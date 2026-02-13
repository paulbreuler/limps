import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

const START_MARKER = '<!-- limps:graph-links:start -->';
const END_MARKER = '<!-- limps:graph-links:end -->';

export interface GraphSyncResult {
  filesScanned: number;
  filesUpdated: number;
  linksGenerated: number;
  warnings: string[];
}

interface FrontmatterSlice {
  frontmatter?: string;
  body: string;
  hasFrontmatter: boolean;
}

interface GraphSections {
  planLink: string | null;
  dependencyLinks: string[];
  blockLinks: string[];
}

interface PlanGraphSections {
  agentLinks: string[];
  docLinks: string[];
}

function walkDirectories(root: string, dirName: string): string[] {
  const found: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries: { isDirectory(): boolean; name: string | Buffer }[];
    try {
      entries = readdirSync(current, { withFileTypes: true }) as { isDirectory(): boolean; name: string | Buffer }[];
    } catch {
      continue;
    }

    for (const entry of entries) {
      const name = String(entry.name);
      const fullPath = join(current, name);
      if (!entry.isDirectory()) continue;
      if (name === '.obsidian' || name === '.git' || name === 'node_modules') {
        continue;
      }
      if (name === dirName) {
        found.push(fullPath);
      } else {
        stack.push(fullPath);
      }
    }
  }

  return found;
}

function parseFrontmatterSections(content: string): FrontmatterSlice {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match || !match[0]) {
    return { hasFrontmatter: false, body: content };
  }
  return {
    hasFrontmatter: true,
    frontmatter: match[1] ?? '',
    body: content.slice(match[0].length),
  };
}

function parseRelationFromFrontmatter(
  frontmatter: string | undefined,
  keys: string[]
): string[] {
  if (!frontmatter) return [];
  const normalize = (value: string): string | null => parseDependencyToAgentNumber(value);

  const values: string[] = [];
  const keyPattern = `(?:${keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;

  const inlineMatch = frontmatter.match(new RegExp(`^${keyPattern}:\\s*\\[([^\\]]*)\\]`, 'm'));
  if (inlineMatch?.[1]) {
    values.push(
      ...inlineMatch[1]
        .split(',')
        .map((part) => normalize(part))
        .filter((value): value is string => Boolean(value))
    );
  }

  const lines = frontmatter.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!(new RegExp(`^${keyPattern}:\\s*$`).test(line.trim()))) continue;

    for (let j = i + 1; j < lines.length; j++) {
      const depLine = lines[j] ?? '';
      const match = depLine.match(/^\s*-\s*(.+)$/);
      if (!match?.[1]) break;
      const normalized = normalize(match[1]);
      if (normalized) values.push(normalized);
    }
  }

  return Array.from(new Set(values));
}

function parseDependenciesFromFrontmatter(frontmatter: string | undefined): string[] {
  return parseRelationFromFrontmatter(frontmatter, ['depends_on', 'dependencies']);
}

function parseBlocksFromFrontmatter(frontmatter: string | undefined): string[] {
  return parseRelationFromFrontmatter(frontmatter, ['blocks']);
}

function getAgentNumber(filename: string): string | null {
  const stem = basename(filename, extname(filename));
  const match = stem.match(/^(\d{3})/);
  return match ? match[1] : null;
}

function parseDependencyToAgentNumber(value: string): string | null {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return null;

  const markdown = trimmed.match(/^\[[^\]]*]\(([^)]+)\)$/);
  const wikilink = trimmed.match(/^\[\[([^\]]+)\]\]$/);
  const token = markdown?.[1]?.trim() ?? wikilink?.[1]?.split('|')[0]?.trim() ?? trimmed;
  if (!token) return null;

  if (/^\d{4}#\d{3}$/.test(token)) {
    return token.slice(-3);
  }
  if (/^\d{1,3}$/.test(token)) {
    return token.padStart(3, '0');
  }

  const noHash = token.split('?')[0]?.split('#')[0] ?? token;
  const fileName = noHash.split(/[\\/]/).pop() ?? '';
  const match = fileName.match(/^(\d{1,3})(?=[^0-9]|$)/);
  return match?.[1] ? match[1].padStart(3, '0') : null;
}

function buildListSection(title: string, links: string[], emptyMessage: string): string[] {
  const lines = links.length > 0 ? links.map((link) => `- ${link}`) : [emptyMessage];
  return [title, ...lines, ''];
}

function buildGraphLinksBlock(sections: GraphSections): string {
  const lines: string[] = [
    START_MARKER,
    '## LIMPS Graph Links',
    '',
  ];

  lines.push('Plan:');
  lines.push(sections.planLink ? `- ${sections.planLink}` : '_No plan link found_');
  lines.push('');

  lines.push(...buildListSection('Depends on:', sections.dependencyLinks, '_No dependencies found_'));
  lines.push(...buildListSection('Blocks:', sections.blockLinks, '_No blocks found_'));

  lines.push(
    END_MARKER,
  );

  return lines.join('\n');
}

function buildPlanGraphLinksBlock(sections: PlanGraphSections): string {
  const lines: string[] = [
    START_MARKER,
    '## LIMPS Graph Links',
    '',
  ];

  lines.push(...buildListSection('Agents:', sections.agentLinks, '_No agents found_'));
  lines.push(...buildListSection('Related docs:', sections.docLinks, '_No related docs found_'));
  lines.push(END_MARKER);

  return lines.join('\n');
}

function findPlanMarkdown(agentsDir: string): string | null {
  const planRoot = dirname(agentsDir);
  const candidates = readdirSync(planRoot).filter((name) => name.toLowerCase().endsWith('.md'));
  const preferred = candidates.find((name) => /-plan\.md$/i.test(name));
  const selected = preferred ?? candidates[0];
  return selected ? join(planRoot, selected) : null;
}

function upsertGeneratedBlock(body: string, block: string): string {
  const regex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, 'm');
  if (regex.test(body)) {
    return body.replace(regex, block);
  }

  const trimmed = body.trimEnd();
  if (!trimmed) return `${block}\n`;
  return `${trimmed}\n\n${block}\n`;
}

export function syncObsidianGraphLinks(_vaultPath: string, plansPath: string): GraphSyncResult {
  const result: GraphSyncResult = {
    filesScanned: 0,
    filesUpdated: 0,
    linksGenerated: 0,
    warnings: [],
  };

  const agentsDirs = walkDirectories(plansPath, 'agents');
  if (agentsDirs.length === 0) {
    result.warnings.push(`No agents directories found under ${plansPath}`);
    return result;
  }

  for (const agentsDir of agentsDirs) {
    const planRoot = dirname(agentsDir);
    let agentFiles = readdirSync(agentsDir)
      .filter((name) => name.endsWith('.agent.md'))
      .map((name) => join(agentsDir, name))
      .sort();

    if (agentFiles.length === 0) continue;
    const planMarkdown = findPlanMarkdown(agentsDir);
    const planLinkRelativeFromAgent = planMarkdown
      ? relative(agentsDir, planMarkdown).replace(/\\/g, '/')
      : null;
    const planLink =
      planLinkRelativeFromAgent && planLinkRelativeFromAgent.length > 0
        ? `[Plan](${planLinkRelativeFromAgent.startsWith('.') ? planLinkRelativeFromAgent : `./${planLinkRelativeFromAgent}`})`
        : null;

    const byNumber = new Map<string, string>();
    for (const filePath of agentFiles) {
      const number = getAgentNumber(basename(filePath));
      if (!number) continue;
      byNumber.set(number, filePath);
    }

    for (const filePath of agentFiles) {
      result.filesScanned++;
      const raw = readFileSync(filePath, 'utf8');
      const sections = parseFrontmatterSections(raw);
      const deps = parseDependenciesFromFrontmatter(sections.frontmatter);
      const blocks = parseBlocksFromFrontmatter(sections.frontmatter);

      const dependencyLinks = deps
        .map((dep) => {
          const depFile = byNumber.get(dep);
          if (!depFile) {
            result.warnings.push(`Missing dependency file for ${dep} in ${agentsDir}`);
            return null;
          }
          const relToCurrent = relative(dirname(filePath), depFile).replace(/\\/g, '/');
          const rel = relToCurrent.startsWith('.') ? relToCurrent : `./${relToCurrent}`;
          return `[Agent ${dep}](${rel})`;
        })
        .filter((value): value is string => Boolean(value));

      const blockLinks = blocks
        .map((dep) => {
          const depFile = byNumber.get(dep);
          if (!depFile) {
            result.warnings.push(`Missing block file for ${dep} in ${agentsDir}`);
            return null;
          }
          const relToCurrent = relative(dirname(filePath), depFile).replace(/\\/g, '/');
          const rel = relToCurrent.startsWith('.') ? relToCurrent : `./${relToCurrent}`;
          return `[Agent ${dep}](${rel})`;
        })
        .filter((value): value is string => Boolean(value));

      result.linksGenerated += dependencyLinks.length + blockLinks.length + (planLink ? 1 : 0);
      const block = buildGraphLinksBlock({
        planLink,
        dependencyLinks,
        blockLinks,
      });
      const nextBody = upsertGeneratedBlock(sections.body, block);

      const nextContent = sections.hasFrontmatter
        ? `---\n${sections.frontmatter ?? ''}\n---\n\n${nextBody}`
        : nextBody;

      if (nextContent !== raw) {
        writeFileSync(filePath, nextContent, 'utf8');
        result.filesUpdated++;
      }
    }

    if (planMarkdown) {
      result.filesScanned++;
      const planRaw = readFileSync(planMarkdown, 'utf8');
      const planSections = parseFrontmatterSections(planRaw);

      const agentLinks = agentFiles
        .map((agentPath) => {
          const number = getAgentNumber(basename(agentPath)) ?? '???';
          const relToPlan = relative(planRoot, agentPath).replace(/\\/g, '/');
          const rel = relToPlan.startsWith('.') ? relToPlan : `./${relToPlan}`;
          return `[Agent ${number}](${rel})`;
        })
        .sort();

      const docLinks = readdirSync(planRoot)
        .filter((name) => name.toLowerCase().endsWith('.md'))
        .filter((name) => join(planRoot, name) !== planMarkdown)
        .map((name) => `[${basename(name, extname(name))}](./${name})`)
        .sort();

      result.linksGenerated += agentLinks.length + docLinks.length;
      const planBlock = buildPlanGraphLinksBlock({ agentLinks, docLinks });
      const planBody = upsertGeneratedBlock(planSections.body, planBlock);
      const planNextContent = planSections.hasFrontmatter
        ? `---\n${planSections.frontmatter ?? ''}\n---\n\n${planBody}`
        : planBody;

      if (planNextContent !== planRaw) {
        writeFileSync(planMarkdown, planNextContent, 'utf8');
        result.filesUpdated++;
      }
    } else {
      result.warnings.push(`No plan markdown found for agents directory ${agentsDir}`);
    }
  }

  return result;
}
