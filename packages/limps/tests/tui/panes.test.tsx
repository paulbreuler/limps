import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { PlansPane } from '../../src/tui/panes/plans.js';
import { FeedPane } from '../../src/tui/panes/feed.js';
import { ContextPane } from '../../src/tui/panes/context.js';
import type { PlanNode } from '../../src/tui/hooks/usePlanTree.js';
import type { AcpSessionEvent } from '../../src/acp/types.js';

describe('PlansPane', () => {
  it('should render empty state', () => {
    const { lastFrame } = render(<PlansPane plans={[]} />);
    expect(lastFrame()).toContain('PLANS');
    expect(lastFrame()).toContain('No plans loaded');
  });

  it('should render plans with agents', () => {
    const plans: PlanNode[] = [
      {
        id: '0001-auth',
        name: 'auth',
        status: 'active',
        agents: [
          { id: '0001-auth#001', title: 'setup', status: 'PASS', num: 1 },
          { id: '0001-auth#002', title: 'login', status: 'WIP', num: 2 },
        ],
      },
    ];
    const { lastFrame } = render(<PlansPane plans={plans} />);
    expect(lastFrame()).toContain('auth');
    expect(lastFrame()).toContain('001');
    expect(lastFrame()).toContain('PASS');
    expect(lastFrame()).toContain('WIP');
  });
});

describe('FeedPane', () => {
  it('should render empty state', () => {
    const { lastFrame } = render(<FeedPane events={[]} />);
    expect(lastFrame()).toContain('LIVE FEED');
    expect(lastFrame()).toContain('No events yet');
  });

  it('should render events', () => {
    const events: AcpSessionEvent[] = [
      {
        type: 'agent_connected',
        agentId: 'agent-1',
        timestamp: '2026-03-01T12:00:00Z',
      },
    ];
    const { lastFrame } = render(<FeedPane events={events} />);
    expect(lastFrame()).toContain('agent_connected');
    expect(lastFrame()).toContain('agent-1');
  });
});

describe('ContextPane', () => {
  it('should render default state', () => {
    const { lastFrame } = render(<ContextPane />);
    expect(lastFrame()).toContain('CONTEXT');
    expect(lastFrame()).toContain('ACP: 0');
    expect(lastFrame()).toContain('MCP: 0');
  });

  it('should render plan name and connection counts', () => {
    const { lastFrame } = render(<ContextPane planName="auth-feature" acpCount={3} mcpCount={1} />);
    expect(lastFrame()).toContain('auth-feature');
    expect(lastFrame()).toContain('ACP: 3');
    expect(lastFrame()).toContain('MCP: 1');
  });

  it('should render INVEST report', () => {
    const { lastFrame } = render(
      <ContextPane
        investReport={{
          score: 80,
          criteria: {
            independent: true,
            negotiable: true,
            valuable: true,
            estimable: false,
            small: true,
            testable: true,
          },
          warnings: [],
          pass: true,
        }}
      />
    );
    expect(lastFrame()).toContain('INVEST HEALTH');
    expect(lastFrame()).toContain('Score: 80/100');
  });
});
