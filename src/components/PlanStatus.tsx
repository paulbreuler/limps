/**
 * Renderer component for displaying plan status.
 * High cohesion: Only responsible for rendering status data.
 */

import { Box, Text } from 'ink';
import type { PlanStatusSummary } from '../cli/status.js';
import { statusColors, textColors } from '../theme/colors.js';

interface PlanStatusProps {
  summary: PlanStatusSummary;
}

export function PlanStatus({ summary }: PlanStatusProps): React.ReactNode {
  // Progress bar
  const barWidth = 20;
  const filledWidth = Math.round((summary.completionPercentage / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = '[' + '#'.repeat(filledWidth) + '-'.repeat(emptyWidth) + ']';

  return (
    <Box flexDirection="column">
      <Text bold>Plan Status: {summary.planName}</Text>
      <Text>{'='.repeat(40)}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text dimColor>Progress: </Text>
          <Text>{progressBar}</Text>
          <Text> </Text>
          <Text
            color={
              summary.completionPercentage === 100 ? statusColors.success : statusColors.warning
            }
          >
            {summary.completionPercentage}%
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Agents:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Box>
            <Text dimColor>Total: </Text>
            <Text color={textColors.primary}>{summary.totalAgents}</Text>
          </Box>
          <Box>
            <Text dimColor>Complete: </Text>
            <Text color={statusColors.success}>{summary.statusCounts.PASS}</Text>
          </Box>
          <Box>
            <Text dimColor>Active: </Text>
            <Text color={statusColors.warning}>{summary.statusCounts.WIP}</Text>
          </Box>
          <Box>
            <Text dimColor>Pending: </Text>
            <Text color={textColors.primary}>{summary.statusCounts.GAP}</Text>
          </Box>
          <Box>
            <Text dimColor>Blocked: </Text>
            <Text color={statusColors.error}>{summary.statusCounts.BLOCKED}</Text>
          </Box>
        </Box>
      </Box>
      {Object.entries(summary.personaCounts).some(([, count]) => count > 0) && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>By Persona:</Text>
          <Box marginLeft={2} flexDirection="column">
            {Object.entries(summary.personaCounts)
              .filter(([, count]) => count > 0)
              .map(([persona, count]) => (
                <Box key={persona}>
                  <Text dimColor>{persona}: </Text>
                  <Text color={textColors.primary}>{count}</Text>
                </Box>
              ))}
          </Box>
        </Box>
      )}
      {summary.wipAgents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>In Progress:</Text>
          <Box marginLeft={2} flexDirection="column">
            {summary.wipAgents.map((agent, index) => (
              <Text key={index} color={statusColors.warning}>
                ● {agent}
              </Text>
            ))}
          </Box>
        </Box>
      )}
      {summary.blockedAgents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Blocked:</Text>
          <Box marginLeft={2} flexDirection="column">
            {summary.blockedAgents.map((agent, index) => (
              <Text key={index} color={statusColors.error}>
                ! {agent}
              </Text>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
