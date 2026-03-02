import React from 'react';
import { Text, Box } from 'ink';
import { z } from 'zod';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import matter from 'gray-matter';
import { validateInvest } from '../../../utils/invest.js';
import { loadCommandContext } from '../../../core/command-context.js';
import { isJsonMode, handleJsonOutput } from '../../../cli/json-output.js';
import type { InvestReport } from '../../../documents/types.js';

export const description = 'Check INVEST compliance for all agents in a plan';

export const args = z.tuple([z.string().describe('Plan ID (e.g., "0001-feature-name")')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().default(false),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

interface AgentInvestResult {
  file: string;
  title: string;
  score: number;
  pass: boolean;
  criteria: InvestReport['criteria'];
  warnings: string[];
}

function checkMark(value: boolean): string {
  return value ? 'Y' : '-';
}

export default function PlanCheckInvest({
  args: [planId],
  options: opts,
}: Props): React.JSX.Element {
  const { config } = loadCommandContext(opts.config);
  const plansPath = config.workspacePath ?? config.plansPath;
  const agentsDir = join(plansPath, planId, 'agents');

  if (!existsSync(agentsDir)) {
    if (isJsonMode(opts)) {
      handleJsonOutput(
        () => ({ error: `No agents directory for plan: ${planId}` }),
        'CHECK_INVEST_ERROR'
      );
    }
    return <Text color="red">No agents directory found for plan: {planId}</Text>;
  }

  const files = readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const results: AgentInvestResult[] = files.map((file) => {
    const content = readFileSync(join(agentsDir, file), 'utf-8');
    const { data: frontmatter, content: body } = matter(content);
    const report = validateInvest(frontmatter as Record<string, unknown>, body);
    return {
      file,
      title: (frontmatter.title as string) ?? file.replace(/\.md$/, ''),
      score: report.score,
      pass: report.pass,
      criteria: report.criteria,
      warnings: report.warnings,
    };
  });

  const totalPass = results.filter((r) => r.pass).length;

  if (isJsonMode(opts)) {
    handleJsonOutput(
      () => ({
        planId,
        results,
        summary: { total: results.length, passing: totalPass, failing: results.length - totalPass },
      }),
      'CHECK_INVEST_ERROR'
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>INVEST Compliance: {planId}</Text>
      <Text> </Text>
      <Text>
        <Text color="cyan">{'Agent'.padEnd(28)}</Text>
        <Text color="cyan">{'Score'.padEnd(8)}</Text>
        <Text color="cyan">{'I'.padEnd(3)}</Text>
        <Text color="cyan">{'N'.padEnd(3)}</Text>
        <Text color="cyan">{'V'.padEnd(3)}</Text>
        <Text color="cyan">{'E'.padEnd(3)}</Text>
        <Text color="cyan">{'S'.padEnd(3)}</Text>
        <Text color="cyan">{'T'.padEnd(3)}</Text>
        <Text color="cyan">Warnings</Text>
      </Text>
      {results.map((r) => (
        <Text key={r.file}>
          <Text>{r.file.slice(0, 27).padEnd(28)}</Text>
          <Text color={r.pass ? 'green' : 'red'}>{`${r.score}%`.padEnd(8)}</Text>
          <Text>{checkMark(r.criteria.independent).padEnd(3)}</Text>
          <Text>{checkMark(r.criteria.negotiable).padEnd(3)}</Text>
          <Text>{checkMark(r.criteria.valuable).padEnd(3)}</Text>
          <Text>{checkMark(r.criteria.estimable).padEnd(3)}</Text>
          <Text>{checkMark(r.criteria.small).padEnd(3)}</Text>
          <Text>{checkMark(r.criteria.testable).padEnd(3)}</Text>
          <Text color="yellow">{r.warnings.length > 0 ? r.warnings.join('; ') : ''}</Text>
        </Text>
      ))}
      <Text> </Text>
      <Text>
        Summary: <Text color="green">{totalPass} passing</Text> /{' '}
        <Text color={totalPass < results.length ? 'red' : 'green'}>{results.length} total</Text>
      </Text>
    </Box>
  );
}
