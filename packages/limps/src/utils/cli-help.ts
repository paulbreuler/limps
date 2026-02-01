import { getChangelogForVersion } from './changelog.js';
import { shouldShowWhatsNew } from './version-state.js';
import { getPackageVersion } from './version.js';

export interface HelpSection {
  title: string;
  lines: string[];
}

export interface HelpMeta {
  usage: string;
  arguments?: string[];
  options?: string[];
  examples?: string[];
  sections?: HelpSection[];
  tips?: string[];
  llmHints?: string[];
  notices?: string[];
}

export interface HelpBlock {
  usage: string;
  arguments?: string[];
  options?: string[];
  examples?: string[];
  sections?: HelpSection[];
  tips?: string[];
  llmHints?: string[];
  includeNotices?: boolean;
}

export function getProjectTipLine(): string {
  return 'Tip: use `limps config list` to find project names for `--project`.';
}

export function getProjectLlmHints(): string[] {
  return ['Use `limps config list` to discover project names for `--project`.'];
}

function getUpdateNoticeLines(): string[] {
  if (!shouldShowWhatsNew()) {
    return [];
  }

  const version = getPackageVersion();
  const changelog = getChangelogForVersion(version) ?? '';
  const hasBreaking = /BREAKING|Breaking Changes|Breaking/i.test(changelog);

  const lines: string[] = [`New in v${version}. Run \`limps\` to see what's new.`];
  if (hasBreaking) {
    lines.push('Breaking changes noted in CHANGELOG.md.');
  }
  return lines;
}

export function buildHelpOutput(block: HelpBlock): { text: string; meta: HelpMeta } {
  const notices = block.includeNotices === false ? [] : getUpdateNoticeLines();
  const meta: HelpMeta = {
    usage: block.usage,
    arguments: block.arguments,
    options: block.options,
    examples: block.examples,
    sections: block.sections,
    tips: block.tips,
    llmHints: block.llmHints,
    notices,
  };

  const lines: string[] = [];

  lines.push(`Usage: ${block.usage}`);

  if (block.arguments && block.arguments.length > 0) {
    lines.push('');
    lines.push('Arguments:');
    lines.push(...block.arguments.map((arg) => `  ${arg}`));
  }

  if (block.options && block.options.length > 0) {
    lines.push('');
    lines.push('Options:');
    lines.push(...block.options.map((opt) => `  ${opt}`));
  }

  if (block.examples && block.examples.length > 0) {
    lines.push('');
    lines.push('Examples:');
    lines.push(...block.examples.map((ex) => `  ${ex}`));
  }

  if (block.sections && block.sections.length > 0) {
    for (const section of block.sections) {
      lines.push('');
      lines.push(`${section.title}:`);
      lines.push(...section.lines.map((line) => `  ${line}`));
    }
  }

  if (block.tips && block.tips.length > 0) {
    lines.push('');
    lines.push('Tips:');
    lines.push(...block.tips.map((line) => `  ${line}`));
  }

  if (block.llmHints && block.llmHints.length > 0) {
    lines.push('');
    lines.push('LLM Hints:');
    lines.push(...block.llmHints.map((line) => `  ${line}`));
  }

  if (notices.length > 0) {
    lines.push('');
    lines.push('Notices:');
    lines.push(...notices.map((line) => `  ${line}`));
  }

  return { text: lines.join('\n'), meta };
}

export function buildHelpText(block: HelpBlock): string {
  return buildHelpOutput(block).text;
}
