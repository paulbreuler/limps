/**
 * Tests for helpers.ts - Pre-loaded utilities for document extraction
 * Feature #3: Built-in Helper Functions
 * Test IDs: helper-sections, helper-frontmatter, helper-codeblocks, helper-features, helper-agents
 */

import { describe, it, expect } from 'vitest';
import {
  extractSections,
  extractFrontmatter,
  extractCodeBlocks,
  extractFeatures,
  extractAgents,
  extractTasks,
  findByPattern,
  summarize,
} from '../../src/rlm/helpers.js';

describe('helpers.ts', () => {
  describe('extractSections', () => {
    // Test ID: helper-sections
    it('parses markdown headers', () => {
      const content = `# Title
Content here
## Subtitle
More content
### Subsection
Even more`;

      const result = extractSections(content);

      expect(result).toEqual({
        '# Title': 'Content here\n## Subtitle\nMore content\n### Subsection\nEven more',
        '## Subtitle': 'More content\n### Subsection\nEven more',
        '### Subsection': 'Even more',
      });
    });

    it('handles nested headers', () => {
      const content = `# Main
Intro text
## Section 1
Content 1
### Subsection 1.1
Content 1.1
## Section 2
Content 2`;

      const result = extractSections(content);

      expect(result).toEqual({
        '# Main':
          'Intro text\n## Section 1\nContent 1\n### Subsection 1.1\nContent 1.1\n## Section 2\nContent 2',
        '## Section 1': 'Content 1\n### Subsection 1.1\nContent 1.1',
        '### Subsection 1.1': 'Content 1.1',
        '## Section 2': 'Content 2',
      });
    });

    it('handles content before first header', () => {
      const content = `Some intro text
before the header
# Title
Content here`;

      const result = extractSections(content);

      expect(result).toEqual({
        '# Title': 'Content here',
      });
    });

    it('handles empty content', () => {
      const result = extractSections('');
      expect(result).toEqual({});
    });

    it('handles content without headers', () => {
      const content = 'Just some regular text\nNo headers here.';
      const result = extractSections(content);
      expect(result).toEqual({});
    });
  });

  describe('extractFrontmatter', () => {
    // Test ID: helper-frontmatter
    it('parses YAML', () => {
      const content = `---
name: foo
version: 1.0
---
Body content here`;

      const result = extractFrontmatter(content);

      expect(result).toEqual({
        meta: {
          name: 'foo',
          version: 1.0,
        },
        body: 'Body content here',
      });
    });

    it('handles missing frontmatter', () => {
      const content = 'Just regular content\nNo frontmatter here.';

      const result = extractFrontmatter(content);

      expect(result).toEqual({
        meta: {},
        body: content,
      });
    });

    it('handles empty frontmatter', () => {
      const content = `---
---
Body content`;

      const result = extractFrontmatter(content);

      expect(result).toEqual({
        meta: {},
        body: 'Body content',
      });
    });
  });

  describe('extractCodeBlocks', () => {
    // Test ID: helper-codeblocks
    it('returns all blocks', () => {
      const content = `Some text
\`\`\`typescript
const x = 1;
\`\`\`
More text
\`\`\`javascript
console.log('hello');
\`\`\`
End`;

      const result = extractCodeBlocks(content);

      expect(result).toEqual([
        {
          language: 'typescript',
          content: 'const x = 1;',
          lineNumber: 2,
        },
        {
          language: 'javascript',
          content: "console.log('hello');",
          lineNumber: 6,
        },
      ]);
    });

    it('filters by language', () => {
      const content = `\`\`\`typescript
const x = 1;
\`\`\`
\`\`\`javascript
console.log('hello');
\`\`\`
\`\`\`typescript
const y = 2;
\`\`\``;

      const result = extractCodeBlocks(content, 'typescript');

      expect(result).toEqual([
        {
          language: 'typescript',
          content: 'const x = 1;',
          lineNumber: 1,
        },
        {
          language: 'typescript',
          content: 'const y = 2;',
          lineNumber: 7,
        },
      ]);
    });

    it('handles code blocks without language', () => {
      const content = `\`\`\`
plain code
\`\`\``;

      const result = extractCodeBlocks(content);

      expect(result).toEqual([
        {
          language: '',
          content: 'plain code',
          lineNumber: 1,
        },
      ]);
    });

    it('handles empty content', () => {
      const result = extractCodeBlocks('');
      expect(result).toEqual([]);
    });
  });

  describe('extractFeatures', () => {
    // Test ID: helper-features
    it('parses plan features', () => {
      const content = `### #1: Feature Name
TL;DR: Description text
Status: \`GAP\`

### #2: Another Feature
TL;DR: Another description
Status: \`WIP\``;

      const result = extractFeatures(content);

      expect(result).toEqual([
        {
          id: '1',
          name: 'Feature Name',
          description: 'Description text',
          status: 'GAP',
        },
        {
          id: '2',
          name: 'Another Feature',
          description: 'Another description',
          status: 'WIP',
        },
      ]);
    });

    it('handles status', () => {
      const content = `### #1: Feature
TL;DR: Desc
Status: \`PASS\`

### #2: Feature 2
TL;DR: Desc 2`;

      const result = extractFeatures(content);

      expect(result).toEqual([
        {
          id: '1',
          name: 'Feature',
          description: 'Desc',
          status: 'PASS',
        },
        {
          id: '2',
          name: 'Feature 2',
          description: 'Desc 2',
          status: undefined,
        },
      ]);
    });

    it('handles features without description', () => {
      const content = `### #1: Feature Name
Status: \`GAP\``;

      const result = extractFeatures(content);

      expect(result).toEqual([
        {
          id: '1',
          name: 'Feature Name',
          description: undefined,
          status: 'GAP',
        },
      ]);
    });

    it('handles empty content', () => {
      const result = extractFeatures('');
      expect(result).toEqual([]);
    });
  });

  describe('extractAgents', () => {
    // Test ID: helper-agents
    it('parses agent assignments', () => {
      const content = `## Agent 1: Query Tools

Features: #2, #4
Own: \`src/tools/rlm-query.ts\`
Depend on: Agent 0
Block: Agent 3

## Agent 2: Helpers

Features: #3
Own: \`helpers.ts\`, \`extractors.ts\`
Depend on: Agent 0
Block: Agent 1`;

      const result = extractAgents(content);

      expect(result).toEqual([
        {
          id: '1',
          name: 'Query Tools',
          features: ['2', '4'],
          files: ['src/tools/rlm-query.ts'],
          depends: ['0'],
          blocks: ['3'],
        },
        {
          id: '2',
          name: 'Helpers',
          features: ['3'],
          files: ['helpers.ts', 'extractors.ts'],
          depends: ['0'],
          blocks: ['1'],
        },
      ]);
    });

    it('handles agents without optional fields', () => {
      const content = `## Agent 1: Simple Agent

Features: #1
Own: \`file.ts\``;

      const result = extractAgents(content);

      expect(result).toEqual([
        {
          id: '1',
          name: 'Simple Agent',
          features: ['1'],
          files: ['file.ts'],
          depends: undefined,
          blocks: undefined,
        },
      ]);
    });

    it('handles empty content', () => {
      const result = extractAgents('');
      expect(result).toEqual([]);
    });
  });

  describe('extractTasks', () => {
    it('parses TDD sections', () => {
      const content = `## TDD

1. \`test-id-1\` → description
2. \`test-id-2\` → another description
3. \`test-id-3\` → third description`;

      const result = extractTasks(content);

      expect(result).toEqual([
        {
          id: 'test-id-1',
          description: 'description',
          status: 'GAP',
          testIds: ['test-id-1'],
        },
        {
          id: 'test-id-2',
          description: 'another description',
          status: 'GAP',
          testIds: ['test-id-2'],
        },
        {
          id: 'test-id-3',
          description: 'third description',
          status: 'GAP',
          testIds: ['test-id-3'],
        },
      ]);
    });

    it('handles tasks with status', () => {
      const content = `## TDD

1. \`test-1\` → desc (Status: WIP)
2. \`test-2\` → desc2 (Status: PASS)`;

      const result = extractTasks(content);

      expect(result).toEqual([
        {
          id: 'test-1',
          description: 'desc',
          status: 'WIP',
          testIds: ['test-1'],
        },
        {
          id: 'test-2',
          description: 'desc2',
          status: 'PASS',
          testIds: ['test-2'],
        },
      ]);
    });

    it('handles empty content', () => {
      const result = extractTasks('');
      expect(result).toEqual([]);
    });
  });

  describe('findByPattern', () => {
    it('returns matches', () => {
      const content = `Line 1: hello world
Line 2: hello there
Line 3: goodbye`;

      const result = findByPattern(content, /hello/g);

      expect(result).toEqual([
        { text: 'hello', line: 1, index: 8 },
        { text: 'hello', line: 2, index: 8 },
      ]);
    });

    it('handles regex with flags', () => {
      const content = `Line 1: Hello world
Line 2: hello there`;

      const result = findByPattern(content, /hello/gi);

      expect(result).toEqual([
        { text: 'Hello', line: 1, index: 8 },
        { text: 'hello', line: 2, index: 8 },
      ]);
    });

    it('handles no matches', () => {
      const content = 'Just some text';
      const result = findByPattern(content, /xyz/g);
      expect(result).toEqual([]);
    });
  });

  describe('summarize', () => {
    it('truncates text', () => {
      const text = 'This is a very long text that should be truncated to a shorter version';
      const result = summarize(text, 10);

      expect(result).toBe('This is a very long text that should be...');
      expect(result.split(' ').length).toBeLessThanOrEqual(11); // 10 words + ellipsis counts as part of last word
    });

    it('handles text shorter than maxWords', () => {
      const text = 'Short text';
      const result = summarize(text, 20);
      expect(result).toBe('Short text');
    });

    it('uses default maxWords', () => {
      const text = 'This is a very long text that should be truncated when no maxWords is provided';
      const result = summarize(text);

      // Default should be reasonable (e.g., 50 words)
      expect(result.split(' ').length).toBeLessThanOrEqual(51);
    });

    it('handles empty text', () => {
      const result = summarize('');
      expect(result).toBe('');
    });
  });
});
