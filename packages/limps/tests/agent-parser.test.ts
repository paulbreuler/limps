import { describe, it, expect } from 'vitest';
import { parseAgentFile } from '../src/agent-parser.js';

describe('agent-parser', () => {
  it('normalizes depends_on values into dependencies', () => {
    const content = `---
status: GAP
persona: coder
dependencies: ["001"]
depends_on: ["2", 3, "004", "not-a-number"]
blocks: []
files: []
---

# Agent 5
`;
    const parsed = parseAgentFile('/plans/0001-test/agents/005_agent.agent.md', content);
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }
    expect(parsed.frontmatter.dependencies).toEqual(['001', '002', '003', '004', 'not-a-number']);
  });

  it('ignores empty depends_on values', () => {
    const content = `---
status: GAP
persona: coder
depends_on: ""
dependencies: []
blocks: []
files: []
---

# Agent 1
`;
    const parsed = parseAgentFile('/plans/0001-test/agents/001_agent.agent.md', content);
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }
    expect(parsed.frontmatter.dependencies).toEqual([]);
  });
});
