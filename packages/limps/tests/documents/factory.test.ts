import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../src/documents/factory.js';

describe('parseDocument', () => {
  it('should parse persona document', () => {
    const content = `---
type: persona
title: Alex Chen
description: A senior engineer
created: "2026-01-01"
tags:
  - limps/persona
---

# Persona: Alex Chen

## Overview

A senior engineer
`;
    const doc = parseDocument(content, 'personas/alex-chen.md');
    expect(doc).not.toBeNull();
    expect(doc?.type).toBe('persona');
    expect(doc?.title).toBe('Alex Chen');
  });

  it('should parse agent document', () => {
    const content = `---
type: agent
status: GAP
persona: coder
title: Add auth
dependencies: []
blocks: []
files:
  - src/auth.ts
created: "2026-01-01"
---

# Agent: Add auth

## Task

Add JWT auth middleware.
`;
    const doc = parseDocument(content, 'agents/001-add-auth.md');
    expect(doc).not.toBeNull();
    expect(doc?.type).toBe('agent');
    expect(doc?.title).toBe('Add auth');
  });

  it('should return null for unknown document type', () => {
    const content = `---
title: Something
---

# Something
`;
    const doc = parseDocument(content, 'unknown.md');
    expect(doc).toBeNull();
  });

  it('should return null for document without frontmatter', () => {
    const content = '# Just a heading\n\nSome content.';
    const doc = parseDocument(content, 'plain.md');
    expect(doc).toBeNull();
  });
});
