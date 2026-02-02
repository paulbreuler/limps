const ANSI = {
  reset: '\u001b[0m',
  green: '\u001b[32m',
  gray: '\u001b[90m',
  cyan: '\u001b[36m',
  border: '\u001b[38;5;208m',
};
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

export function renderUpdateBox(current: string, latest: string, packageName: string): string {
  const lines = [
    '',
    `Update available ${ANSI.gray}${current}${ANSI.reset} → ${ANSI.green}${latest}${ANSI.reset}`,
    `Run ${ANSI.cyan}npm i -g ${packageName}${ANSI.reset} to update`,
    '',
  ];
  const maxLineLength = Math.max(...lines.map((line) => stripAnsi(line).length));
  const padding = 2;
  const innerWidth = maxLineLength + padding * 2;
  const horizontal = '─'.repeat(innerWidth);
  const top = `${ANSI.border}╭${horizontal}╮${ANSI.reset}`;
  const bottom = `${ANSI.border}╰${horizontal}╯${ANSI.reset}`;
  const boxedLines = lines.map((line) => {
    const lineLength = stripAnsi(line).length;
    const rightPadding = Math.max(0, innerWidth - padding - lineLength);
    return `${ANSI.border}│${ANSI.reset}${' '.repeat(padding)}${line}${' '.repeat(rightPadding)}${ANSI.border}│${ANSI.reset}`;
  });
  return [top, ...boxedLines, bottom].join('\n');
}
