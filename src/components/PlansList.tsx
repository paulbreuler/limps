/**
 * Renderer component for displaying plans list.
 * High cohesion: Only responsible for rendering plan data.
 */

import { Box, Text } from 'ink';
import type { CliPlanEntry } from '../cli/list-plans.js';
import { getStatusColor, getWorkTypeColor } from '../theme/colors.js';

interface PlansListProps {
  plans: CliPlanEntry[];
  total: number;
}

function getStatusIcon(status: CliPlanEntry['status']): string {
  switch (status) {
    case 'GAP':
      return ' ';
    case 'WIP':
      return '●';
    case 'PASS':
      return '✓';
    case 'BLOCKED':
      return '!';
  }
}

export function PlansList({ plans, total }: PlansListProps): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text bold>Plans:</Text>
      <Box flexDirection="column" marginTop={1}>
        {plans.map((plan) => (
          <Box key={plan.number} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={getStatusColor(plan.status)}>{getStatusIcon(plan.status)}</Text>
              <Text> </Text>
              <Text bold>{plan.number.padStart(4, '0')}</Text>
              <Text> - </Text>
              <Text bold>{plan.name}</Text>
            </Box>
            <Box marginLeft={4}>
              <Text dimColor>Type: </Text>
              <Text color={getWorkTypeColor(plan.workType)}>{plan.workType}</Text>
              <Text dimColor> | Status: </Text>
              <Text color={getStatusColor(plan.status)}>{plan.status}</Text>
            </Box>
            {plan.overview && (
              <Box marginLeft={4}>
                <Text dimColor>{plan.overview}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Total: {total} plan(s)</Text>
      </Box>
    </Box>
  );
}
