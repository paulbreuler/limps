/**
 * Tests for AgentsList renderer component.
 * TDD: Tests written before implementation.
 */

import { render } from 'ink-testing-library';
import { AgentsList } from '../../src/components/AgentsList.js';
import type { ParsedAgentFile, AgentFrontmatter } from '../../src/agent-parser.js';

function createMockAgent(overrides: Partial<ParsedAgentFile> = {}): ParsedAgentFile {
  const frontmatter: AgentFrontmatter = {
    status: 'GAP',
    persona: 'coder',
    dependencies: [],
    blocks: [],
    files: [],
    ...overrides.frontmatter,
  };

  return {
    taskId: '0001-test-plan#000',
    planFolder: '0001-test-plan',
    agentNumber: '000',
    path: '/path/to/agent.md',
    frontmatter,
    content: '# Agent',
    mtime: new Date(),
    title: 'Test Agent',
    ...overrides,
  };
}

describe('AgentsList', () => {
  it('renders agents list with formatted output', () => {
    const agents: ParsedAgentFile[] = [
      createMockAgent({ agentNumber: '000', title: 'First Agent' }),
      createMockAgent({ agentNumber: '001', title: 'Second Agent' }),
    ];

    const statusCounts = {
      GAP: 2,
      WIP: 0,
      PASS: 0,
      BLOCKED: 0,
    };

    const { lastFrame } = render(
      <AgentsList planName="Test Plan" agents={agents} statusCounts={statusCounts} total={2} />
    );

    const output = lastFrame() ?? '';
    expect(output).toContain('Agents in Test Plan:');
    expect(output).toContain('000');
    expect(output).toContain('First Agent');
    expect(output).toContain('001');
    expect(output).toContain('Second Agent');
    expect(output).toContain('Summary:');
    expect(output).toContain('Total: 2');
  });

  it('displays agent details correctly', () => {
    const agents: ParsedAgentFile[] = [
      createMockAgent({
        agentNumber: '000',
        title: 'Test Agent',
        frontmatter: {
          status: 'WIP',
          persona: 'reviewer',
          dependencies: ['001'],
          blocks: [],
          files: ['file1.ts', 'file2.ts'],
        },
      }),
    ];

    const statusCounts = {
      GAP: 0,
      WIP: 1,
      PASS: 0,
      BLOCKED: 0,
    };

    const { lastFrame } = render(
      <AgentsList planName="Test Plan" agents={agents} statusCounts={statusCounts} total={1} />
    );

    const output = lastFrame() ?? '';
    expect(output).toContain('Test Agent');
    expect(output).toContain('Persona: reviewer');
    expect(output).toContain('Status: WIP');
    expect(output).toContain('Dependencies: 1');
    expect(output).toContain('Files: 2');
  });

  it('displays status counts in summary', () => {
    const agents: ParsedAgentFile[] = [
      createMockAgent({
        agentNumber: '000',
        frontmatter: {
          status: 'GAP',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      }),
      createMockAgent({
        agentNumber: '001',
        frontmatter: {
          status: 'WIP',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      }),
      createMockAgent({
        agentNumber: '002',
        frontmatter: {
          status: 'PASS',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      }),
      createMockAgent({
        agentNumber: '003',
        frontmatter: {
          status: 'BLOCKED',
          persona: 'coder',
          dependencies: [],
          blocks: [],
          files: [],
        },
      }),
    ];

    const statusCounts = {
      GAP: 1,
      WIP: 1,
      PASS: 1,
      BLOCKED: 1,
    };

    const { lastFrame } = render(
      <AgentsList planName="Test Plan" agents={agents} statusCounts={statusCounts} total={4} />
    );

    const output = lastFrame() ?? '';
    expect(output).toContain('PASS: 1');
    expect(output).toContain('WIP: 1');
    expect(output).toContain('GAP: 1');
    expect(output).toContain('BLOCKED: 1');
  });

  it('uses agent number as title when title is missing', () => {
    const agents: ParsedAgentFile[] = [createMockAgent({ agentNumber: '000', title: '' })];

    const statusCounts = {
      GAP: 1,
      WIP: 0,
      PASS: 0,
      BLOCKED: 0,
    };

    const { lastFrame } = render(
      <AgentsList planName="Test Plan" agents={agents} statusCounts={statusCounts} total={1} />
    );

    const output = lastFrame() ?? '';
    expect(output).toContain('Agent 000');
  });
});
