import { Text } from 'ink';
import { buildHelpOutput } from '../../utils/cli-help.js';

export const description = 'Plan and task workflows (recommended command group)';

export default function PlanCommand(): React.ReactNode {
  const help = buildHelpOutput({
    usage: 'limps plan <command>',
    sections: [
      {
        title: 'Commands',
        lines: [
          'create <name>              Create a new plan',
          'list                       List all plans',
          'agents <plan>              List agents in a plan',
          'status <plan>              Show plan progress',
          'next <plan>                Get next best task',
          'score --plan <p> --agent <a>  Score a specific task',
          'scores --plan <p>          Score all available tasks in a plan',
          'repair [plan]              Check/fix plan frontmatter issues',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'limps plan list',
          'limps plan agents 4',
          'limps plan score --plan 4 --agent 3',
          'limps plan scores --plan 4 --json',
        ],
      },
      {
        title: 'Help',
        lines: ['Run `limps plan <command> --help` for more details and examples.'],
      },
    ],
  });

  return <Text>{help.text}</Text>;
}
