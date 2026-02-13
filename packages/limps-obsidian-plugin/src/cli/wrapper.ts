import { execFile } from 'node:child_process';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandExecOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  parseJson?: boolean;
}

export interface CommandExecResult<T = unknown> {
  ok: boolean;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  data?: T;
  error?: string;
}

function buildExecEnv(command: string): NodeJS.ProcessEnv {
  const pathParts: string[] = [];
  if (command.includes('/')) {
    pathParts.push(dirname(command));
  }
  pathParts.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin');
  if (process.env.PATH) pathParts.push(process.env.PATH);

  const mergedPath = pathParts.filter(Boolean).join(':');
  return {
    ...process.env,
    PATH: mergedPath,
  };
}

export interface LimpsRunOptions {
  limpsPath: string;
  configPath?: string;
  cwd: string;
  timeoutMs: number;
  parseJson?: boolean;
}

interface ExecErrorShape {
  stdout?: string;
  stderr?: string;
  code?: number | string | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  message?: string;
}

export interface DaemonStatus {
  running: boolean;
  host?: string;
  port?: number;
  healthy?: boolean;
  logPath?: string;
}

export interface DaemonStatusResult {
  ok: boolean;
  daemon?: DaemonStatus;
  error?: string;
}

export interface GraphHealthSummary {
  totalEntities: number;
  totalRelations: number;
  conflictCount: number;
  errorCount: number;
  warningCount: number;
  lastIndexed: string;
}

export interface GraphHealthResult {
  summary: GraphHealthSummary;
  conflicts: unknown[];
}

export interface GraphHealthFetchResult {
  ok: boolean;
  health?: GraphHealthResult;
  error?: string;
}

export interface DependencyPathConversionResult {
  plansProcessed: number;
  filesScanned: number;
  filesUpdated: number;
  dependenciesConverted: number;
  warnings: string[];
}

export interface DependencyPathConversionFetchResult {
  ok: boolean;
  result?: DependencyPathConversionResult;
  error?: string;
}

function parseErrorCode(code: number | string | null | undefined): number | null {
  if (typeof code === 'number') return code;
  if (typeof code === 'string') {
    const parsed = Number.parseInt(code, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function parseJsonOutput<T>(value: string): { ok: true; data: T } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(value) as T };
  } catch (error) {
    return { ok: false, error: `Failed to parse JSON output: ${String(error)}` };
  }
}

export async function execCommand<T = unknown>(options: CommandExecOptions): Promise<CommandExecResult<T>> {
  const baseResult = {
    command: options.command,
    args: options.args,
  };

  try {
    const { stdout, stderr } = await execFileAsync(options.command, options.args, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: buildExecEnv(options.command),
    });

    if (options.parseJson) {
      const parsed = parseJsonOutput<T>(stdout);
      if (!parsed.ok) {
        return {
          ...baseResult,
          ok: false,
          stdout,
          stderr,
          code: 0,
          signal: null,
          timedOut: false,
          error: parsed.error,
        };
      }

      return {
        ...baseResult,
        ok: true,
        stdout,
        stderr,
        code: 0,
        signal: null,
        timedOut: false,
        data: parsed.data,
      };
    }

    return {
      ...baseResult,
      ok: true,
      stdout,
      stderr,
      code: 0,
      signal: null,
      timedOut: false,
    };
  } catch (error) {
    const execError = error as ExecErrorShape;
    const code = parseErrorCode(execError.code);
    const signal = execError.signal ?? null;
    const timedOut = execError.killed === true && signal === 'SIGTERM';
    const stdout = execError.stdout ?? '';
    const stderr = execError.stderr ?? '';

    return {
      ...baseResult,
      ok: false,
      stdout,
      stderr,
      code,
      signal,
      timedOut,
      error: execError.message ?? 'Command failed',
    };
  }
}

export async function runLimps<T = unknown>(
  limpsArgs: string[],
  options: LimpsRunOptions
): Promise<CommandExecResult<T>> {
  const args = [...limpsArgs];
  if (options.configPath && !args.includes('--config')) {
    args.push('--config', options.configPath);
  }

  return execCommand<T>({
    command: options.limpsPath,
    args,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    parseJson: options.parseJson,
  });
}

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function getDaemonStatus(options: LimpsRunOptions): Promise<DaemonStatusResult> {
  const result = await runLimps<Record<string, unknown>>(['server', 'status', '--json'], {
    ...options,
    parseJson: true,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? (result.stderr || 'Failed to run limps server status'),
    };
  }

  const topLevel = getObjectRecord(result.data);
  const dataRecord = getObjectRecord(topLevel?.data);

  const running = getBoolean(dataRecord?.running);
  if (running === undefined) {
    return {
      ok: false,
      error: 'Unexpected `limps server status --json` response shape',
    };
  }

  return {
    ok: true,
    daemon: {
      running,
      host: getString(dataRecord?.host),
      port: getNumber(dataRecord?.port),
      healthy: getBoolean(dataRecord?.healthy),
      logPath: getString(dataRecord?.logPath),
    },
  };
}

function defaultGraphSummary(): GraphHealthSummary {
  return {
    totalEntities: 0,
    totalRelations: 0,
    conflictCount: 0,
    errorCount: 0,
    warningCount: 0,
    lastIndexed: '',
  };
}

function parseGraphSummary(value: unknown): GraphHealthSummary {
  const source = getObjectRecord(value);
  const fallback = defaultGraphSummary();

  if (!source) return fallback;

  return {
    totalEntities: getNumber(source.totalEntities) ?? fallback.totalEntities,
    totalRelations: getNumber(source.totalRelations) ?? fallback.totalRelations,
    conflictCount: getNumber(source.conflictCount) ?? fallback.conflictCount,
    errorCount: getNumber(source.errorCount) ?? fallback.errorCount,
    warningCount: getNumber(source.warningCount) ?? fallback.warningCount,
    lastIndexed: getString(source.lastIndexed) ?? fallback.lastIndexed,
  };
}

export async function getGraphHealth(options: LimpsRunOptions): Promise<GraphHealthFetchResult> {
  const result = await runLimps<Record<string, unknown>>(['graph', 'health', '--json'], {
    ...options,
    parseJson: true,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? (result.stderr || 'Failed to run limps graph health'),
    };
  }

  const topLevel = getObjectRecord(result.data);
  const dataRecord = getObjectRecord(topLevel?.data);
  const summary = parseGraphSummary(dataRecord?.summary);
  const conflicts = Array.isArray(dataRecord?.conflicts) ? dataRecord.conflicts : [];

  return {
    ok: true,
    health: {
      summary,
      conflicts,
    },
  };
}

export async function runGraphReindex(options: LimpsRunOptions): Promise<CommandExecResult> {
  return runLimps(['graph', 'reindex', '--json'], {
    ...options,
    parseJson: false,
  });
}

export async function runDepsToPaths(
  options: LimpsRunOptions
): Promise<DependencyPathConversionFetchResult> {
  const result = await runLimps<Record<string, unknown>>(['plan', 'deps-to-paths', '--json'], {
    ...options,
    parseJson: true,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? (result.stderr || 'Failed to run limps plan deps-to-paths'),
    };
  }

  const topLevel = getObjectRecord(result.data);
  const dataRecord = getObjectRecord(topLevel?.data);
  if (!dataRecord) {
    return {
      ok: false,
      error: 'Unexpected `limps plan deps-to-paths --json` response shape',
    };
  }

  return {
    ok: true,
    result: {
      plansProcessed: getNumber(dataRecord.plansProcessed) ?? 0,
      filesScanned: getNumber(dataRecord.filesScanned) ?? 0,
      filesUpdated: getNumber(dataRecord.filesUpdated) ?? 0,
      dependenciesConverted: getNumber(dataRecord.dependenciesConverted) ?? 0,
      warnings: Array.isArray(dataRecord.warnings)
        ? dataRecord.warnings.filter((v): v is string => typeof v === 'string')
        : [],
    },
  };
}
