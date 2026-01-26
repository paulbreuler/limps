import { Text } from 'ink';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { getNextTaskData, type TaskScoreBreakdown } from '../cli/next-task.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { NextTask } from '../components/NextTask.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../cli/json-output.js';

export const description = 'Get the next best task';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function NextTaskCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;

  // Handle JSON output mode - must check before usage validation
  if (isJsonMode(options)) {
    if (!planId) {
      return outputJson(wrapError('Plan ID is required', { code: 'MISSING_PLAN_ID' }), 1);
    }

    // For JSON mode, we run synchronously since we're not rendering React
    const configPath = resolveConfigPath(options.config);
    const config = loadConfig(configPath);

    // Use promise-based handling for async function
    getNextTaskData(config, planId)
      .then((data) => {
        if ('error' in data) {
          outputJson(wrapError(data.error, { code: 'NEXT_TASK_ERROR' }), 1);
        } else {
          outputJson(wrapSuccess(data));
        }
      })
      .catch((err) => {
        outputJson(wrapError((err as Error).message, { code: 'NEXT_TASK_ERROR' }), 1);
      });

    // Return null while promise resolves (process.exit will terminate)
    return null;
  }

  if (!planId) {
    return (
      <Text>
        <Text color="yellow">Usage:</Text> limps next-task {'<plan>'} [options]
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
        <Text color="cyan">Scoring Algorithm:</Text>
        {'\n'}
        {'  '}Dependency Score: 40 pts (all deps satisfied)
        {'\n'}
        {'  '}Priority Score: 30 pts (lower agent # = higher)
        {'\n'}
        {'  '}Workload Score: 30 pts (fewer files = higher)
        {'\n\n'}
        <Text color="cyan">Examples:</Text>
        {'\n'}
        {'  '}limps next-task 4{'\n'}
        {'  '}limps next-task 0004-my-feature{'\n'}
        {'  '}limps next-task 4 --json
      </Text>
    );
  }
  const [result, setResult] = useState<
    { task: TaskScoreBreakdown; otherAvailableTasks: number } | { error: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const data = await getNextTaskData(config, planId);
        setResult(data);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    void run();
  }, [planId, options.config]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!result) {
    return <Text>Loading...</Text>;
  }

  if ('error' in result) {
    return <Text color="red">{result.error}</Text>;
  }

  return <NextTask task={result.task} otherAvailableTasks={result.otherAvailableTasks} />;
}
