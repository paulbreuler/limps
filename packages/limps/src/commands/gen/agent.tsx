import React from 'react';
import { Text, Box } from 'ink';
import { z } from 'zod';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { AgentTask } from '../../documents/agent-task.js';
import { resolvePrimer } from '../../documents/primer-resolver.js';
import { validateInvest } from '../../utils/invest.js';
import { loadCommandContext } from '../../core/command-context.js';
import { isJsonMode, handleJsonOutput, JSON_OPTION } from '../../cli/json-output.js';

export const description = 'Create an agent task document';

export const args = z.tuple([
  z.string().describe('Plan ID (e.g., "0001-feature-name")'),
  z.string().describe('Agent task title'),
]);

export const options = z.object({
  persona: z.string().optional().describe('Persona type (coder, reviewer, pm, customer)'),
  primer: z.string().optional().describe('Override primer file path'),
  strict: z.boolean().optional().default(false).describe('Fail if INVEST score < 60'),
  config: z.string().optional().describe('Path to config file'),
  json: JSON_OPTION,
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function GenAgent({
  args: [planId, title],
  options: opts,
}: Props): React.JSX.Element {
  const { config } = loadCommandContext(opts.config);
  const plansPath = config.workspacePath ?? config.plansPath;
  const planDir = join(plansPath, planId);

  const primerResult = resolvePrimer(planDir, config, opts.primer);
  const task = new AgentTask({
    title,
    planId,
    persona: opts.persona,
    primerPath: primerResult?.path,
    primerContent: primerResult?.content,
  });

  const agentsDir = join(planDir, 'agents');
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  const outputPath = join(agentsDir, `000-${slug}.md`);

  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(outputPath, task.toMarkdown(), 'utf-8');

  // Run INVEST validation
  const report = validateInvest(task.frontmatter() as Record<string, unknown>, task.toMarkdown());

  if (opts.strict && !report.pass) {
    if (isJsonMode(opts)) {
      handleJsonOutput(
        () => ({
          error: 'INVEST validation failed',
          score: report.score,
          criteria: report.criteria,
          warnings: report.warnings,
          path: outputPath,
        }),
        'GEN_AGENT_INVEST_FAIL'
      );
    }
    return (
      <Box flexDirection="column">
        <Text color="red">INVEST validation failed (score: {report.score}%)</Text>
        {report.warnings.map((w, i) => (
          <Text key={i} color="yellow">
            {' '}
            - {w}
          </Text>
        ))}
        <Text dimColor>File created at: {outputPath}</Text>
      </Box>
    );
  }

  if (isJsonMode(opts)) {
    handleJsonOutput(
      () => ({
        id: task.id,
        type: 'agent',
        title,
        planId,
        path: outputPath,
        invest: { score: report.score, pass: report.pass },
      }),
      'GEN_AGENT_ERROR'
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green">
        Created agent: <Text bold>{title}</Text>
      </Text>
      <Text dimColor>{outputPath}</Text>
      <Text>
        INVEST score: <Text color={report.pass ? 'green' : 'yellow'}>{report.score}%</Text>
      </Text>
      {report.warnings.map((w, i) => (
        <Text key={i} color="yellow">
          {' '}
          - {w}
        </Text>
      ))}
    </Box>
  );
}
