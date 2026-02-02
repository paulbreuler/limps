import { describe, it, expect } from 'vitest';
import { renderUpdateBox } from '../../src/utils/update-box.js';

function stripAnsi(value: string): string {
  let output = '';
  let i = 0;
  while (i < value.length) {
    const char = value[i];
    if (char === '\u001b' && value[i + 1] === '[') {
      i += 2;
      while (i < value.length && value[i] !== 'm') {
        i += 1;
      }
      if (i < value.length && value[i] === 'm') {
        i += 1;
      }
      continue;
    }
    output += char;
    i += 1;
  }
  return output;
}

describe('renderUpdateBox', () => {
  it('renders a boxed update message', () => {
    const output = renderUpdateBox('2.9.0', '2.10.0', '@sudosandwich/limps');
    const stripped = stripAnsi(output);
    expect(stripped).toContain('Update available 2.9.0 → 2.10.0');
    expect(stripped).toContain('Run npm i -g @sudosandwich/limps to update');
    expect(stripped).toContain('╭');
    expect(stripped).toContain('╰');
  });

  it('renders lines with equal width after stripping ANSI', () => {
    const output = renderUpdateBox('2.9.0', '2.10.0', '@sudosandwich/limps');
    const lines = output.split('\n').map((line) => stripAnsi(line));
    const lengths = lines.map((line) => line.length);
    const uniqueLengths = new Set(lengths);
    expect(uniqueLengths.size).toBe(1);
  });
});
