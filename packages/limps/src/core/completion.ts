import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config.js';
import { findPlansByPrefix, listAllPlans } from '../cli/task-resolver.js';
import { resolveConfigPath } from '../utils/config-resolver.js';

const ROOT_COMMANDS = [
  'server',
  'plan',
  'docs',
  'config',
  'health',
  'graph',
  'proposals',
  'completion',
  'init',
  'reset',
  'version',
];

const GROUP_COMMANDS: Record<string, string[]> = {
  server: ['start', 'stop', 'status', 'bridge'],
  plan: ['create', 'list', 'agents', 'status', 'next', 'score', 'scores', 'repair'],
  docs: ['list', 'search', 'create', 'update', 'delete', 'process', 'reindex', 'tags'],
  'docs tags': ['list', 'add', 'remove'],
  config: ['show', 'scoring', 'path', 'show-resolution', 'print', 'update', 'upgrade'],
  health: ['check', 'staleness', 'inference'],
  graph: ['reindex', 'health', 'search', 'trace', 'entity', 'overlap', 'check', 'suggest', 'watch'],
  proposals: ['apply', 'apply-safe'],
};

const COMMAND_OPTIONS: Record<string, string[]> = {
  'plan score': ['--plan', '--agent', '--config', '--json', '--help'],
  'plan scores': ['--plan', '--config', '--json', '--help'],
  'plan status': ['--agent', '--set', '--notes', '--config', '--json', '--help'],
  'plan agents': ['--config', '--json', '--help'],
  'plan next': ['--config', '--json', '--help'],
  'docs process': [
    '--config',
    '--pattern',
    '--code',
    '--json',
    '--timeout',
    '--max-docs',
    '--pretty',
    '--help',
  ],
  'docs list': ['--config', '--depth', '--pattern', '--include-hidden', '--json', '--help'],
  'docs search': ['--config', '--limit', '--frontmatter', '--case-sensitive', '--json', '--help'],
  'docs create': ['--config', '--template', '--content', '--json', '--help'],
  'docs update': [
    '--config',
    '--mode',
    '--content',
    '--patch',
    '--no-backup',
    '--force',
    '--json',
    '--help',
  ],
  'docs delete': ['--config', '--confirm', '--permanent', '--json', '--help'],
  'docs tags list': ['--config', '--json', '--help'],
  'docs tags add': ['--config', '--json', '--tags', '--help'],
  'docs tags remove': ['--config', '--json', '--tags', '--help'],
  'server start': ['--config', '--foreground', '--port', '--host', '--help'],
  'server stop': ['--config', '--help'],
  'server status': ['--config', '--json', '--help'],
  'server bridge': ['--config', '--help'],
  completion: ['--help'],
  '*': ['--help'],
};

const STATUS_VALUES = ['GAP', 'WIP', 'PASS', 'BLOCKED'];

interface CompletionContext {
  configPath?: string;
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function byPrefix(values: string[], prefix: string): string[] {
  if (!prefix) {
    return uniq(values).sort();
  }

  return uniq(values)
    .filter((value) => value.startsWith(prefix))
    .sort();
}

function readConfigSafe(configPath?: string): ReturnType<typeof loadConfig> | null {
  try {
    const resolved = resolveConfigPath(configPath);
    return loadConfig(resolved);
  } catch {
    return null;
  }
}

function getPlanSuggestions(prefix: string, ctx: CompletionContext): string[] {
  const config = readConfigSafe(ctx.configPath);
  if (!config) {
    return [];
  }

  return byPrefix(listAllPlans(config.plansPath), prefix);
}

function getAgentSuggestions(
  planInput: string | undefined,
  prefix: string,
  ctx: CompletionContext
): string[] {
  if (!planInput) {
    return [];
  }

  const config = readConfigSafe(ctx.configPath);
  if (!config) {
    return [];
  }

  const matches = findPlansByPrefix(config.plansPath, planInput);
  if (matches.length !== 1) {
    return [];
  }

  const agentsDir = join(config.plansPath, matches[0], 'agents');
  if (!existsSync(agentsDir)) {
    return [];
  }

  const agents = readdirSync(agentsDir)
    .map((file) => file.match(/^(\d+)_.*\.agent\.md$/)?.[1])
    .filter((value): value is string => Boolean(value));

  return byPrefix(agents, prefix);
}

function parseOptionValue(tokens: string[], option: string): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === option) {
      const value = tokens[i + 1];
      if (value && !value.startsWith('-')) {
        return value;
      }
    }

    if (token.startsWith(`${option}=`)) {
      return token.slice(option.length + 1);
    }
  }

  return undefined;
}

function positionalTokens(tokens: string[]): string[] {
  const values: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      if (!token.includes('=')) {
        const maybeValue = tokens[i + 1];
        if (maybeValue && !maybeValue.startsWith('-')) {
          i += 1;
        }
      }
      continue;
    }

    if (token.startsWith('-')) {
      continue;
    }

    values.push(token);
  }

  return values;
}

function commandPath(positionals: string[]): string {
  const first = positionals[0];
  const second = positionals[1];
  const third = positionals[2];

  if (!first) {
    return '';
  }

  if (first === 'docs' && second === 'tags' && third) {
    if ((GROUP_COMMANDS['docs tags'] ?? []).includes(third)) {
      return `docs tags ${third}`;
    }
    return 'docs tags';
  }

  if (first === 'docs' && second === 'tags') {
    return 'docs tags';
  }

  if (GROUP_COMMANDS[first] && second) {
    return `${first} ${second}`;
  }

  return first;
}

function suggestByPosition(
  positionals: string[],
  current: string,
  ctx: CompletionContext
): string[] {
  const first = positionals[0];
  const second = positionals[1];

  if (!first) {
    return byPrefix(ROOT_COMMANDS, current);
  }

  if (first === 'docs' && second === 'tags' && positionals.length <= 2) {
    return byPrefix(GROUP_COMMANDS['docs tags'] ?? [], current);
  }

  if (GROUP_COMMANDS[first] && positionals.length <= 1) {
    return byPrefix(GROUP_COMMANDS[first] ?? [], current);
  }

  if (
    first === 'plan' &&
    (second === 'agents' || second === 'status' || second === 'next') &&
    positionals.length <= 3
  ) {
    return getPlanSuggestions(current, ctx);
  }

  return [];
}

export function getCompletionSuggestions(tokens: string[], ctx: CompletionContext = {}): string[] {
  const raw = [...tokens];
  const current = raw.length > 0 ? raw[raw.length - 1] : '';
  const prior = raw.length > 0 ? raw.slice(0, -1) : [];
  const priorPositionals = positionalTokens(prior);
  const path = commandPath(priorPositionals);
  const effectiveCtx: CompletionContext = {
    configPath: parseOptionValue(raw, '--config') ?? ctx.configPath,
  };

  const prevToken = prior.length > 0 ? prior[prior.length - 1] : '';
  if (prevToken === '--set') {
    return byPrefix(STATUS_VALUES, current);
  }

  if (prevToken === '--plan') {
    return getPlanSuggestions(current, effectiveCtx);
  }

  if (prevToken === '--agent') {
    const planFromOption = parseOptionValue(prior, '--plan');
    return getAgentSuggestions(planFromOption, current, effectiveCtx);
  }

  if (current.startsWith('-')) {
    const specific = COMMAND_OPTIONS[path] ?? [];
    const generic = COMMAND_OPTIONS['*'] ?? [];
    return byPrefix([...specific, ...generic], current);
  }

  const byPosition = suggestByPosition(priorPositionals, current, effectiveCtx);
  if (byPosition.length > 0) {
    return byPosition;
  }

  const fallbackOptions = COMMAND_OPTIONS[path] ?? COMMAND_OPTIONS['*'] ?? [];
  return byPrefix(fallbackOptions, current);
}

function zshCompletionScript(): string {
  return [
    '#compdef limps',
    '',
    '_limps() {',
    '  local -a results',
    '  results=("${(@f)$(LIMPS_COMPLETE=1 limps -- "${words[@]:2}")}")',
    "  _describe 'limps' results",
    '}',
    '',
    'compdef _limps limps',
    '',
  ].join('\n');
}

function bashCompletionScript(): string {
  return [
    '_limps_completion() {',
    "  local IFS=$'\\\\n'",
    '  COMPREPLY=( $( LIMPS_COMPLETE=1 limps -- "${COMP_WORDS[@]:1}" ) )',
    '}',
    '',
    'complete -F _limps_completion limps',
    '',
  ].join('\n');
}

function fishCompletionScript(): string {
  return [
    'function __limps_complete',
    '  set -l args (commandline -opc)',
    '  env LIMPS_COMPLETE=1 limps -- "$args[2..-1]"',
    'end',
    '',
    "complete -c limps -f -a '(__limps_complete)'",
    '',
  ].join('\n');
}

export function getCompletionScript(shell: 'zsh' | 'bash' | 'fish'): string {
  switch (shell) {
    case 'zsh':
      return zshCompletionScript();
    case 'bash':
      return bashCompletionScript();
    case 'fish':
      return fishCompletionScript();
    default:
      return zshCompletionScript();
  }
}
