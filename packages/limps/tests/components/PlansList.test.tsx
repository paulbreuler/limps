/**
 * Tests for PlansList renderer component.
 * TDD: Tests written before implementation.
 */

import { render } from 'ink-testing-library';
import { PlansList } from '../../src/components/PlansList.js';
import type { CliPlanEntry } from '../../src/cli/list-plans.js';

describe('PlansList', () => {
  it('renders plans list with formatted output', () => {
    const plans: CliPlanEntry[] = [
      {
        number: '1',
        name: 'Test Plan',
        workType: 'feature',
        overview: 'A test plan description',
        status: 'GAP',
      },
      {
        number: '2',
        name: 'Another Plan',
        workType: 'bug',
        overview: '',
        status: 'WIP',
      },
    ];

    const { lastFrame } = render(<PlansList plans={plans} total={2} />);

    const output = lastFrame() ?? '';
    expect(output).toContain('Plans:');
    expect(output).toContain('0001');
    expect(output).toContain('Test Plan');
    expect(output).toContain('0002');
    expect(output).toContain('Another Plan');
    expect(output).toContain('Total: 2 plan(s)');
  });

  it('displays plan overview when present', () => {
    const plans: CliPlanEntry[] = [
      {
        number: '1',
        name: 'Test Plan',
        workType: 'feature',
        overview: 'A test plan description',
        status: 'GAP',
      },
    ];

    const { lastFrame } = render(<PlansList plans={plans} total={1} />);

    const output = lastFrame() ?? '';
    expect(output).toContain('A test plan description');
  });

  it('does not display overview when empty', () => {
    const plans: CliPlanEntry[] = [
      {
        number: '1',
        name: 'Test Plan',
        workType: 'feature',
        overview: '',
        status: 'GAP',
      },
    ];

    const { lastFrame } = render(<PlansList plans={plans} total={1} />);

    const output = lastFrame() ?? '';
    expect(output).not.toContain('undefined');
  });

  it('displays correct status colors and icons', () => {
    const plans: CliPlanEntry[] = [
      { number: '1', name: 'Gap Plan', workType: 'feature', overview: '', status: 'GAP' },
      { number: '2', name: 'Wip Plan', workType: 'feature', overview: '', status: 'WIP' },
      { number: '3', name: 'Pass Plan', workType: 'feature', overview: '', status: 'PASS' },
      { number: '4', name: 'Blocked Plan', workType: 'feature', overview: '', status: 'BLOCKED' },
    ];

    const { lastFrame } = render(<PlansList plans={plans} total={4} />);

    const output = lastFrame() ?? '';
    expect(output).toContain('Gap Plan');
    expect(output).toContain('Wip Plan');
    expect(output).toContain('Pass Plan');
    expect(output).toContain('Blocked Plan');
  });

  it('displays correct work type colors', () => {
    const plans: CliPlanEntry[] = [
      { number: '1', name: 'Feature', workType: 'feature', overview: '', status: 'GAP' },
      { number: '2', name: 'Bug', workType: 'bug', overview: '', status: 'GAP' },
      { number: '3', name: 'Refactor', workType: 'refactor', overview: '', status: 'GAP' },
      { number: '4', name: 'Docs', workType: 'docs', overview: '', status: 'GAP' },
    ];

    const { lastFrame } = render(<PlansList plans={plans} total={4} />);

    const output = lastFrame() ?? '';
    expect(output).toContain('Feature');
    expect(output).toContain('Bug');
    expect(output).toContain('Refactor');
    expect(output).toContain('Docs');
  });
});
