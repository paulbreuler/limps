import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { z } from 'zod';
import { resetAll } from '../cli/config-cmd.js';
import { resolveConfigPath } from '../utils/config-resolver.js';

export const description = 'Reset limps — remove project data';

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  force: z.boolean().default(false).describe('Skip confirmation prompt'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function ResetCommand({ options: opts }: Props): React.ReactNode {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const configPath = resolveConfigPath(opts.config);
      const result = resetAll(configPath, { force: opts.force });
      setLines(result);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [opts.config, opts.force]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  return <Text color={opts.force ? 'green' : 'yellow'}>{lines.join('\n')}</Text>;
}
