---
title: Documentation
status: GAP
persona: coder
depends_on: [000, 001, 002, 003, 004, 005, 006, 007]
files:
  - docs/context-hierarchy.md
  - docs/memory-system.md
  - docs/workspace-setup.md
  - README.md
tags: [documentation, context, memory]
---

# Agent 008: Documentation

## Objective

Document the context hierarchy and memory system comprehensively.

## Tasks

1. **Context hierarchy guide** (`docs/context-hierarchy.md`)
   - Workspace → Project → Plan → Agent hierarchy
   - How inheritance works (CSS-like cascade)
   - Override mechanisms
   - Root document types (vision, brand, architecture, NFRs)

2. **Memory system guide** (`docs/memory-system.md`)
   - Agent memory: findings, decisions, blockers
   - Plan memory: shared discoveries, lessons
   - When to use each type
   - Memory CLI reference

3. **Workspace setup guide** (`docs/workspace-setup.md`)
   - `limps workspace init` walkthrough
   - Recommended directory structure
   - Template workspace.md
   - Best practices for root documents

4. **README updates**
   - Add context hierarchy section
   - Link to detailed guides
   - Quick examples

## Key Topics to Cover

### Context Hierarchy
- Why inheritance matters (prevents drift)
- Layer priorities explained
- How to override workspace defaults
- Staleness warnings and what to do

### Memory System
- White-box memory philosophy
- Agent memory best practices
- Promoting to plan memory
- Session logging workflow

### Root Documents
- vision.md: North star, mission
- brand.md: Terminology, tone
- architecture.md: Technical principles
- nfrs.md: Security, performance

## Acceptance Criteria

- [ ] All CLI commands documented with examples
- [ ] Inheritance rules clearly explained
- [ ] Memory workflow guides included
- [ ] Root document templates provided
- [ ] Follows existing docs style
