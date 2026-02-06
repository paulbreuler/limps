import React, { useEffect } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../../utils/config-resolver.js';
import { buildHelpOutput, getProjectLlmHints, getProjectTipLine } from '../../utils/cli-help.js';
import { isJsonMode, outputJson, wrapSuccess } from '../../cli/json-output.js';
import { openGraphDb } from '../../cli/graph-db.js';
import { graphCheck } from '../../cli/graph-check.js';
import type { ConflictType } from '../../graph/conflict-detector.js';

export const description = 'Run conflict detection checks';

export const args = z.tuple([z.string().describe('conflict type (optional)').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

const VALID_TYPES = ['file_contention', 'feature_overlap', 'circular_dependency', 'stale_wip'];

export default function GraphCheckCommand({ args, options }: Props): React.ReactNode {
  const [typeArg] = args;
  const configPath = options.project
    ? resolveProjectConfigPath(options.project)
    : resolveConfigPath(options.config);
  const config = loadConfig(configPath);
  const jsonMode = isJsonMode(options);

  const help = buildHelpOutput({
    usage: 'limps graph check [type] [options]',
    arguments: [
      'type  Conflict type: file_contention, feature_overlap, circular_dependency, stale_wip (optional)',
    ],
    options: [
      '--config Path to config file',
      '--project Registered project name',
      '--json Output as JSON',
    ],
    sections: [
      {
        title: 'Examples',
        lines: [
          'limps graph check',
          'limps graph check file_contention',
          'limps graph check --json',
        ],
      },
    ],
    tips: [getProjectTipLine()],
    llmHints: getProjectLlmHints(),
  });

  const conflictType =
    typeArg && VALID_TYPES.includes(typeArg) ? (typeArg as ConflictType) : undefined;

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) return;
    const timer = setTimeout(() => {
      try {
        const db = openGraphDb(config);
        try {
          const result = graphCheck(config, db, { type: conflictType });
          const exitCode = result.errorCount > 0 ? 2 : 0;
          outputJson(wrapSuccess(result), exitCode);
        } finally {
          db.close();
        }
      } catch {
        // outputJson calls process.exit
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, config, conflictType]);

  if (jsonMode) return null;

  try {
    const db = openGraphDb(config);
    try {
      const result = graphCheck(config, db, { type: conflictType });
      return (
        <Text>
          Checked: {result.checkedType}
          {'\n'}Conflicts: {result.conflicts.length} ({result.errorCount} errors,{' '}
          {result.warningCount} warnings)
          {result.conflicts.map((c, i) => (
            <React.Fragment key={i}>
              {'\n'}
              <Text color={c.severity === 'error' ? 'red' : 'yellow'}>
                [{c.severity.toUpperCase()}]
              </Text>{' '}
              {c.message}
            </React.Fragment>
          ))}
          {result.conflicts.length === 0 && <>{'\n'}No conflicts detected.</>}
        </Text>
      );
    } finally {
      db.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <Text>
        <Text color="red">{message}</Text>
        {'\n\n'}
        {help.text}
      </Text>
    );
  }
}
