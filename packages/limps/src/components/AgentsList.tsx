/**
 * Renderer component for displaying agents list.
 * High cohesion: Only responsible for rendering agent data.
 */

import { Box, Text } from 'ink';
import type { ParsedAgentFile } from '../agent-parser.js';
import { getStatusColor, statusColors, textColors } from '../theme/colors.js';

interface AgentsListProps {
  planName: string;
  agents: ParsedAgentFile[];
  statusCounts: {
    GAP: number;
    WIP: number;
    PASS: number;
    BLOCKED: number;
  };
  total: number;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'GAP':
      return ' ';
    case 'WIP':
      return '●';
    case 'PASS':
      return '✓';
    case 'BLOCKED':
      return '!';
    default:
      return ' ';
  }
}

export function AgentsList({
  planName,
  agents,
  statusCounts,
  total,
}: AgentsListProps): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text bold>Agents in {planName}:</Text>
      <Box flexDirection="column" marginTop={1}>
        {agents.map((agent) => {
          const title = agent.title || `Agent ${agent.agentNumber}`;
          const status = agent.frontmatter.status;
          return (
            <Box key={agent.agentNumber} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={getStatusColor(status)}>{getStatusIcon(status)}</Text>
                <Text> </Text>
                <Text bold>{agent.agentNumber}</Text>
                <Text> - </Text>
                <Text bold>{title}</Text>
              </Box>
              <Box marginLeft={4}>
                <Text dimColor>Persona: </Text>
                <Text color={textColors.primary}>{agent.frontmatter.persona}</Text>
                <Text dimColor> | Status: </Text>
                <Text color={getStatusColor(status as 'GAP' | 'WIP' | 'PASS' | 'BLOCKED')}>
                  {status}
                </Text>
              </Box>
              <Box marginLeft={4}>
                <Text dimColor>
                  Dependencies:{' '}
                  <Text color={textColors.primary}>{agent.frontmatter.dependencies.length}</Text> |
                  Files: <Text color={textColors.primary}>{agent.frontmatter.files.length}</Text>
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Summary:</Text>
        <Box marginLeft={2}>
          <Text dimColor>Total: </Text>
          <Text color={textColors.primary}>{total}</Text>
          <Text dimColor> | PASS: </Text>
          <Text color={statusColors.success}>{statusCounts.PASS}</Text>
          <Text dimColor> | WIP: </Text>
          <Text color={statusColors.warning}>{statusCounts.WIP}</Text>
          <Text dimColor> | GAP: </Text>
          <Text color={textColors.primary}>{statusCounts.GAP}</Text>
          <Text dimColor> | BLOCKED: </Text>
          <Text color={statusColors.error}>{statusCounts.BLOCKED}</Text>
        </Box>
      </Box>
    </Box>
  );
}
