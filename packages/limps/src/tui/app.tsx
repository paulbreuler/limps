import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { PlansPane } from './panes/plans.js';
import { FeedPane } from './panes/feed.js';
import { ContextPane } from './panes/context.js';
import { useAcpEvents } from './hooks/useAcpEvents.js';
import { usePlanTree } from './hooks/usePlanTree.js';
import type { AcpSessionManager } from '../acp/session-manager.js';

interface TuiAppProps {
  sessionManager: AcpSessionManager;
  acpPort: number;
  mcpPort?: number;
}

export function TuiApp({ sessionManager, acpPort, mcpPort }: TuiAppProps): React.JSX.Element {
  const { exit } = useApp();
  const [focusedPlan] = useState<string | undefined>();

  const events = useAcpEvents(sessionManager);
  const plans = usePlanTree();

  useInput(
    useCallback(
      (input: string) => {
        if (input === 'q') {
          exit();
        }
      },
      [exit]
    )
  );

  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 24}>
      {/* Header */}
      <Box borderStyle="single" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          limps
        </Text>
        <Text dimColor>
          ACP: {acpPort} {mcpPort ? `MCP: ${mcpPort}` : ''}
        </Text>
      </Box>

      {/* Three panes */}
      <Box flexGrow={1}>
        {/* Left: Plans */}
        <Box width="25%" borderStyle="single" paddingX={1} flexDirection="column">
          <PlansPane plans={plans} focusedPlanId={focusedPlan} />
        </Box>

        {/* Center: Live Feed */}
        <Box flexGrow={1} borderStyle="single" paddingX={1} flexDirection="column">
          <FeedPane events={events} />
        </Box>

        {/* Right: Context */}
        <Box width="30%" borderStyle="single" paddingX={1} flexDirection="column">
          <ContextPane acpCount={sessionManager.getSessions().length} mcpCount={0} />
        </Box>
      </Box>

      {/* Status bar */}
      <Box paddingX={1}>
        <Text dimColor>[q] quit [↑↓] navigate [t] assign task [p] edit primer [?] help</Text>
      </Box>
    </Box>
  );
}
