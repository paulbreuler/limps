/**
 * Tests for ping MCP tool.
 */

import { describe, it, expect } from 'vitest';
import { handlePing, PingInputSchema } from '../../src/tools/ping.js';
import type { ToolContext } from '../../src/types.js';

describe('ping tool', () => {
  const context: ToolContext = {
    config: {
      plansPath: '/tmp/test-plans',
      dataPath: '/tmp/test-data',
      scoring: {
        weights: { dependency: 40, priority: 30, workload: 30 },
        biases: {},
      },
    },
    db: null as never,
  };

  it('should return pong with timestamp', async () => {
    const before = new Date().toISOString();
    const result = await handlePing({}, context);
    const after = new Date().toISOString();

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pong).toBe(true);
    expect(typeof parsed.timestamp).toBe('string');
    expect(parsed.timestamp >= before).toBe(true);
    expect(parsed.timestamp <= after).toBe(true);
  });

  it('should have a strict empty input schema', () => {
    const parsed = PingInputSchema.parse({});
    expect(parsed).toEqual({});

    expect(() => PingInputSchema.parse({ extra: 'field' })).toThrow();
  });
});
