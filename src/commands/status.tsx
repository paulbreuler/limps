import { Text } from 'ink';
import { z } from 'zod';
import { getPlanStatusSummary } from '../cli/status.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { PlanStatus } from '../components/PlanStatus.js';
import { handleJsonOutput, isJsonMode, outputJson, wrapError } from '../cli/json-output.js';

export const description = 'Show plan status';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function StatusCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;

  // Handle JSON output mode - must check before usage validation
  if (isJsonMode(options)) {
    if (!planId) {
      return outputJson(wrapError('Plan ID is required', { code: 'MISSING_PLAN_ID' }), 1);
    }

    const configPath = resolveConfigPath(options.config);
    const config = loadConfig(configPath);

    return handleJsonOutput(() => {
      return getPlanStatusSummary(config, planId);
    }, 'STATUS_ERROR');
  }

  if (!planId) {
    return (
      <Text>
        <Text color="yellow">Usage:</Text> limps status {'<plan>'} [options]
        {'\n\n'}
        <Text color="cyan">Arguments:</Text>
        {'\n'}
        {'  '}plan Plan ID or name (e.g., "4" or "0004-feature-name")
        {'\n\n'}
        <Text color="cyan">Options:</Text>
        {'\n'}
        {'  '}--config Path to config file
        {'\n'}
        {'  '}--json Output as JSON
        {'\n\n'}
        <Text color="cyan">Output includes:</Text>
        {'\n'}
        {'  '}- Completion percentage with progress bar
        {'\n'}
        {'  '}- Status counts (PASS, WIP, GAP, BLOCKED)
        {'\n'}
        {'  '}- In-progress and blocked agents
        {'\n\n'}
        <Text color="cyan">Examples:</Text>
        {'\n'}
        {'  '}limps status 4{'\n'}
        {'  '}limps status 0004-my-feature{'\n'}
        {'  '}limps status 4 --json
      </Text>
    );
  }

  try {
    const configPath = resolveConfigPath(options.config);
    const config = loadConfig(configPath);
    const summary = getPlanStatusSummary(config, planId);
    return <PlanStatus summary={summary} />;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
