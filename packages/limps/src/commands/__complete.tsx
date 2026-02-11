import { Text } from 'ink';
import { z } from 'zod';
import { getCompletionSuggestions } from '../core/completion.js';

export const description = 'Internal completion endpoint';

export const args = z.array(z.string());

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

export default function InternalCompleteCommand({ args, options }: Props): React.ReactNode {
  const tokens = args[0] === '--' ? args.slice(1) : args;
  const suggestions = getCompletionSuggestions(tokens, { configPath: options.config });
  return <Text>{suggestions.join('\n')}</Text>;
}
