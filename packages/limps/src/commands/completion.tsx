import { Text } from 'ink';
import { z } from 'zod';
import { buildHelpOutput } from '../utils/cli-help.js';
import { getCompletionScript } from '../core/completion.js';

export const description = 'Generate shell completion scripts (bash, zsh, fish)';

export const args = z.tuple([z.enum(['bash', 'zsh', 'fish']).optional()]);

interface Props {
  args: z.infer<typeof args>;
}

export default function CompletionCommand({ args }: Props): React.ReactNode {
  const [shell] = args;
  const help = buildHelpOutput({
    usage: 'limps completion <bash|zsh|fish>',
    examples: [
      'limps completion zsh >> ~/.zshrc',
      'limps completion bash >> ~/.bashrc',
      'limps completion fish > ~/.config/fish/completions/limps.fish',
    ],
    tips: [
      'After writing completion config, open a new shell session.',
      'Use tab after `limps `, `limps plan `, and `limps plan score --plan ` for suggestions.',
    ],
  });

  if (!shell) {
    return <Text>{help.text}</Text>;
  }

  return <Text>{getCompletionScript(shell)}</Text>;
}
