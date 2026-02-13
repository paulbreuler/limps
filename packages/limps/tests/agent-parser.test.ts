import { describe, it, expect } from 'vitest';
import { parseAgentFile, extractPlanFolder } from '../src/agent-parser.js';

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

  it('normalizes file-path dependencies into local agent numbers', () => {
    const content = `---
status: GAP
persona: coder
depends_on:
  - "./001_base.agent.md"
  - "[Base](./002_core.agent.md)"
  - "[[003_ui.agent|UI]]"
dependencies: []
blocks: []
files: []
---

# Agent 4
`;
    const parsed = parseAgentFile('/plans/0001-test/agents/004_agent.agent.md', content);
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }
    expect(parsed.frontmatter.dependencies).toEqual(['001', '002', '003']);
  });

  it('extracts plan folder without requiring a /plans/ path segment', () => {
    const planFolder = extractPlanFolder(
      '/workspace/my-project/0007-feature/agents/002_test.agent.md'
    );
    expect(planFolder).toBe('0007-feature');
  });

  it('parses agent files in non-canonical plansPath layouts', () => {
    const content = `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 2
`;
    const parsed = parseAgentFile(
      '/workspace/repo-root/0007-feature/agents/002_test.agent.md',
      content
    );
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }
    expect(parsed.planFolder).toBe('0007-feature');
    expect(parsed.taskId).toBe('0007-feature#002');
  });
});
