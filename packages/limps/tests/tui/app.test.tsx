import { describe, it, expect } from 'vitest';

describe('TUI App', () => {
  it('should be importable', async () => {
    const { TuiApp } = await import('../../src/tui/app.js');
    expect(TuiApp).toBeDefined();
  });
});
