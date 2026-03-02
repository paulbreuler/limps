import React from 'react';
import { Box, Text } from 'ink';
import type { InvestReport } from '../../documents/types.js';

interface ContextProps {
  primerContent?: string;
  investReport?: InvestReport;
  planName?: string;
  acpCount?: number;
  mcpCount?: number;
}

export function ContextPane({
  primerContent,
  investReport,
  planName,
  acpCount = 0,
  mcpCount = 0,
}: ContextProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>CONTEXT</Text>
      {planName && <Text dimColor>Plan: {planName}</Text>}
      <Text> </Text>
      <Text bold>CONNECTIONS</Text>
      <Text>
        ACP: {acpCount} MCP: {mcpCount}
      </Text>
      <Text> </Text>
      {primerContent && (
        <>
          <Text bold>PRIMER</Text>
          <Text>
            {primerContent.slice(0, 200)}
            {primerContent.length > 200 ? '...' : ''}
          </Text>
          <Text> </Text>
        </>
      )}
      {investReport && (
        <>
          <Text bold>INVEST HEALTH</Text>
          <Text>
            <Text color={investReport.criteria.independent ? 'green' : 'red'}>
              {investReport.criteria.independent ? '\u2713' : '\u2717'} I
            </Text>{' '}
            <Text color={investReport.criteria.negotiable ? 'green' : 'red'}>
              {investReport.criteria.negotiable ? '\u2713' : '\u2717'} N
            </Text>{' '}
            <Text color={investReport.criteria.valuable ? 'green' : 'red'}>
              {investReport.criteria.valuable ? '\u2713' : '\u2717'} V
            </Text>{' '}
            <Text color={investReport.criteria.estimable ? 'green' : 'red'}>
              {investReport.criteria.estimable ? '\u2713' : '\u2717'} E
            </Text>{' '}
            <Text color={investReport.criteria.small ? 'green' : 'red'}>
              {investReport.criteria.small ? '\u2713' : '\u2717'} S
            </Text>{' '}
            <Text color={investReport.criteria.testable ? 'green' : 'red'}>
              {investReport.criteria.testable ? '\u2713' : '\u2717'} T
            </Text>
          </Text>
          <Text>Score: {investReport.score}/100</Text>
        </>
      )}
    </Box>
  );
}
