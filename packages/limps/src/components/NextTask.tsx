/**
 * Renderer component for displaying next task.
 * High cohesion: Only responsible for rendering task data.
 */

import { Box, Text } from 'ink';
import type { TaskScoreBreakdown } from '../cli/next-task.js';
import { getScoreColor, textColors } from '../theme/colors.js';

interface NextTaskProps {
  task: TaskScoreBreakdown;
  otherAvailableTasks: number;
}

export function NextTask({ task, otherAvailableTasks }: NextTaskProps): React.ReactNode {
  const totalMax = task.weights.dependency + task.weights.priority + task.weights.workload;
  return (
    <Box flexDirection="column">
      <Text bold>Next Best Task:</Text>
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text dimColor>Task ID: </Text>
          <Text bold color={textColors.primary}>
            {task.taskId}
          </Text>
        </Box>
        <Box>
          <Text dimColor>Title: </Text>
          <Text bold color={textColors.primary}>
            {task.title}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Score Breakdown:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Box>
            <Text dimColor>Total Score: </Text>
            <Text color={getScoreColor(task.totalScore, totalMax)} bold>
              {task.totalScore}/{totalMax}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Dependencies: </Text>
            <Text color={getScoreColor(task.dependencyScore, task.weights.dependency)}>
              {task.dependencyScore}/{task.weights.dependency}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Priority: </Text>
            <Text color={getScoreColor(task.priorityScore, task.weights.priority)}>
              {task.priorityScore}/{task.weights.priority}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Workload: </Text>
            <Text color={getScoreColor(task.workloadScore, task.weights.workload)}>
              {task.workloadScore}/{task.weights.workload}
            </Text>
          </Box>
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Scoring Reasons:</Text>
        <Box marginLeft={2} flexDirection="column">
          {task.reasons.map((reason, index) => (
            <Text key={index} color={textColors.primary}>
              - {reason}
            </Text>
          ))}
        </Box>
      </Box>
      {otherAvailableTasks > 0 && (
        <Box marginTop={1}>
          <Text dimColor>
            Other available tasks: <Text color={textColors.primary}>{otherAvailableTasks}</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}
