import { Text } from 'ink';
import { z } from 'zod';
import { getPlanStatusSummary } from '../cli/status.js';
import { loadConfig } from '../config.js';
import { resolveConfigPath } from '../utils/config-resolver.js';
import { PlanStatus } from '../components/PlanStatus.js';

export const description = 'Show plan status';

export const args = z.tuple([z.string().describe('Plan ID or name')]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function StatusCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;

  try {
    const configPath = resolveConfigPath(options.config);
    const config = loadConfig(configPath);
    const summary = getPlanStatusSummary(config, planId);
    return <PlanStatus summary={summary} />;
  } catch (error) {
    return <Text color="red">Error: {(error as Error).message}</Text>;
  }
}
