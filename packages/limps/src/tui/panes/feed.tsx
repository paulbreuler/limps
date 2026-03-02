import React from 'react';
import { Box, Text } from 'ink';
import type { AcpSessionEvent } from '../../acp/types.js';

interface FeedProps {
  events: AcpSessionEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  agent_connected: 'green',
  task_claimed: 'cyan',
  status_updated: 'yellow',
  agent_disconnected: 'red',
};

export function FeedPane({ events }: FeedProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>LIVE FEED</Text>
      {events.length === 0 ? (
        <Text dimColor>No events yet</Text>
      ) : (
        events.slice(0, 20).map((event, i) => (
          <Text key={i} color={EVENT_COLORS[event.type] ?? undefined}>
            {event.timestamp.slice(11, 19)} <Text bold>{event.type}</Text>
            {event.agentId ? ` agent=${event.agentId}` : ''}
            {event.taskId ? ` task=${event.taskId}` : ''}
            {event.status ? ` status=${event.status}` : ''}
          </Text>
        ))
      )}
    </Box>
  );
}
