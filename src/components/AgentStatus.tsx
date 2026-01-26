import React from 'react';
import { Text, Box } from 'ink';
import type { AgentStatusSummary } from '../cli/status.js';

interface Props {
  summary: AgentStatusSummary;
}

/**
 * Status icon based on status value.
 */
function StatusIcon({ status }: { status: string }): React.ReactNode {
  switch (status) {
    case 'PASS':
      return <Text color="green">✓</Text>;
    case 'WIP':
      return <Text color="yellow">◐</Text>;
    case 'GAP':
      return <Text color="gray">○</Text>;
    case 'BLOCKED':
      return <Text color="red">✕</Text>;
    default:
      return <Text>?</Text>;
  }
}

/**
 * Status color based on status value.
 */
function statusColor(status: string): string {
  switch (status) {
    case 'PASS':
      return 'green';
    case 'WIP':
      return 'yellow';
    case 'GAP':
      return 'white';
    case 'BLOCKED':
      return 'red';
    default:
      return 'white';
  }
}

/**
 * Format ISO duration to human-readable form.
 */
function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return isoDuration;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);

  if (hours > 0) {
    return `${hours}h ${minutes}m ago`;
  }
  return `${minutes}m ago`;
}

/**
 * Component to display detailed agent status.
 */
export function AgentStatus({ summary }: Props): React.ReactNode {
  const borderChar = '─';
  const width = 50;

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Header */}
      <Box>
        <Text color="cyan">{borderChar.repeat(width)}</Text>
      </Box>
      <Box>
        <Text bold color="cyan">
          Agent: {summary.agentNumber} - {summary.title}
        </Text>
      </Box>
      <Box>
        <Text color="cyan">{borderChar.repeat(width)}</Text>
      </Box>

      {/* Basic Info */}
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text>Plan: </Text>
          <Text color="white">{summary.planName}</Text>
        </Box>
        <Box>
          <Text>Status: </Text>
          <StatusIcon status={summary.status} />
          <Text color={statusColor(summary.status)}> {summary.status}</Text>
        </Box>
        <Box>
          <Text>Persona: </Text>
          <Text color="white">{summary.persona}</Text>
        </Box>
      </Box>

      {/* Claim & Heartbeat */}
      {summary.claimed && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text>Claimed: </Text>
            <Text color="yellow">
              {summary.claimed.by} ({formatDuration(summary.claimed.elapsed)})
            </Text>
          </Box>
          {summary.heartbeat && (
            <Box>
              <Text>Heartbeat: </Text>
              <Text color={summary.heartbeat.stale ? 'red' : 'green'}>
                {summary.heartbeat.stale ? '⚠ Stale' : '✓ Active'}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Features */}
      {summary.features.total > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">{borderChar.repeat(width)}</Text>
          <Box>
            <Text bold>Features: </Text>
            <Text>{summary.features.total} total</Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {summary.features.pass > 0 && (
              <Box>
                <Text color="green">✓ PASS {summary.features.pass}</Text>
              </Box>
            )}
            {summary.features.wip > 0 && (
              <Box>
                <Text color="yellow">◐ WIP {summary.features.wip}</Text>
              </Box>
            )}
            {summary.features.gap > 0 && (
              <Box>
                <Text color="gray">○ GAP {summary.features.gap}</Text>
              </Box>
            )}
            {summary.features.blocked > 0 && (
              <Box>
                <Text color="red">✕ BLOCKED {summary.features.blocked}</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Files */}
      {summary.files.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">{borderChar.repeat(width)}</Text>
          <Box>
            <Text bold>Files: </Text>
            <Text>{summary.files.length}</Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {summary.files.map((file, i) => (
              <Box key={i}>
                <Text color={file.locked ? 'yellow' : 'gray'}>
                  {file.locked ? '🔒' : '  '} {file.path}
                </Text>
                {file.locked && file.lockedBy && <Text color="gray"> (by {file.lockedBy})</Text>}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Dependencies */}
      {summary.dependencies.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">{borderChar.repeat(width)}</Text>
          <Box>
            <Text bold>Dependencies: </Text>
            <Text>{summary.dependencies.length}</Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {summary.dependencies.map((dep, i) => (
              <Box key={i}>
                <StatusIcon status={dep.status} />
                <Text color={dep.satisfied ? 'green' : 'gray'}>
                  {' '}
                  {dep.taskId}: {dep.title}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="cyan">{borderChar.repeat(width)}</Text>
      </Box>
    </Box>
  );
}
