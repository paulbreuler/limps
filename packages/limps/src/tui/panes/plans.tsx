import React from 'react';
import { Box, Text } from 'ink';
import type { PlanNode } from '../hooks/usePlanTree.js';

const STATUS_ICONS: Record<string, string> = {
  GAP: '\u00B7',
  WIP: '\u25C9',
  PASS: '\u2713',
  BLOCKED: '\u2717',
};

interface PlansProps {
  plans: PlanNode[];
  focusedPlanId?: string;
}

export function PlansPane({ plans, focusedPlanId }: PlansProps): React.JSX.Element {
  if (plans.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>PLANS</Text>
        <Text dimColor>No plans loaded</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>PLANS</Text>
      {plans.map((plan) => (
        <Box key={plan.id} flexDirection="column">
          <Text color={plan.id === focusedPlanId ? 'cyan' : undefined}>
            {'\u25B8 '}
            {plan.name}
          </Text>
          {plan.agents.map((agent) => (
            <Text key={agent.id} dimColor={agent.status === 'GAP'}>
              {'  \u251C '}
              {String(agent.num).padStart(3, '0')}{' '}
              <Text
                color={
                  agent.status === 'PASS'
                    ? 'green'
                    : agent.status === 'WIP'
                      ? 'yellow'
                      : agent.status === 'BLOCKED'
                        ? 'red'
                        : undefined
                }
              >
                {STATUS_ICONS[agent.status] ?? '?'}
              </Text>{' '}
              {agent.status}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
