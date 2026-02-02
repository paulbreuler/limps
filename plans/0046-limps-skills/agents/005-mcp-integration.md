---
title: MCP Integration
status: GAP
persona: coder
depends_on: [000]
files:
  - src/tools/skill.ts
tags: [skills, mcp, tools]
---

# Agent 005: MCP Integration

## Objective

Create MCP tools that wrap skill CLI commands (CLI-first pattern).

## Tasks

1. **load_skill tool** (`src/tools/skill.ts`)
   - Wraps `limps skill read <name>`
   - Returns full SKILL.md content for AI consumption
   - Used when AI needs guidance on limps usage

2. **list_skills tool**
   - Wraps `limps skill list --json`
   - Returns skill metadata array
   - For AI to discover available skills

3. **Tool registration**
   - Add to MCP server tool list
   - Include descriptions for AI discovery

## Tool Definitions

```typescript
export const loadSkillTool: MCPTool = {
  name: 'load_skill',
  description: 'Load a limps skill for guidance. Use when you need help with limps planning tools.',
  inputSchema: {
    type: 'object',
    properties: {
      skillName: { type: 'string', description: 'Skill name (e.g., limps-planning)' }
    },
    required: ['skillName']
  },
  handler: async ({ skillName }) => {
    const result = await exec(`limps skill read ${skillName}`);
    return { content: [{ type: 'text', text: result.stdout }] };
  }
};
```

## Acceptance Criteria

- [ ] `load_skill` MCP tool returns SKILL.md content
- [ ] `list_skills` MCP tool returns metadata array
- [ ] Tools call CLI (don't reimplement logic)
- [ ] Error handling for missing skills
