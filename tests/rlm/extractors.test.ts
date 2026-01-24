/**
 * Tests for extractors.ts - Lower-level parsing utilities
 * Feature #3: Built-in Helper Functions (extractors layer)
 * Test IDs: extractor-headers, extractor-frontmatter, extractor-gherkin
 */

import { describe, it, expect } from 'vitest';
import {
  parseMarkdownHeaders,
  parseYamlFrontmatter,
  parseGherkinScenarios,
} from '../../src/rlm/extractors.js';

describe('extractors.ts', () => {
  describe('parseMarkdownHeaders', () => {
    // Test ID: extractor-headers
    it('returns levels', () => {
      const content = `# H1 Title
## H2 Subtitle
### H3 Section
#### H4 Subsection
##### H5 Detail
###### H6 Fine
`;

      const result = parseMarkdownHeaders(content);

      expect(result).toEqual([
        { level: 1, text: 'H1 Title', line: 1 },
        { level: 2, text: 'H2 Subtitle', line: 2 },
        { level: 3, text: 'H3 Section', line: 3 },
        { level: 4, text: 'H4 Subsection', line: 4 },
        { level: 5, text: 'H5 Detail', line: 5 },
        { level: 6, text: 'H6 Fine', line: 6 },
      ]);
    });

    it('handles headers with leading/trailing whitespace', () => {
      const content = `#  Title with spaces  
##  Another header  `;

      const result = parseMarkdownHeaders(content);

      expect(result).toEqual([
        { level: 1, text: 'Title with spaces', line: 1 },
        { level: 2, text: 'Another header', line: 2 },
      ]);
    });

    it('handles empty content', () => {
      const result = parseMarkdownHeaders('');
      expect(result).toEqual([]);
    });

    it('handles content without headers', () => {
      const content = 'Just some regular text\nNo headers here.';
      const result = parseMarkdownHeaders(content);
      expect(result).toEqual([]);
    });

    it('handles headers with special characters', () => {
      const content = `# Header with "quotes"
## Header with (parentheses)
### Header with [brackets]`;

      const result = parseMarkdownHeaders(content);

      expect(result).toEqual([
        { level: 1, text: 'Header with "quotes"', line: 1 },
        { level: 2, text: 'Header with (parentheses)', line: 2 },
        { level: 3, text: 'Header with [brackets]', line: 3 },
      ]);
    });
  });

  describe('parseYamlFrontmatter', () => {
    // Test ID: extractor-frontmatter
    it('handles ---', () => {
      const content = `---
name: foo
version: 1.0
---
Body content here`;

      const result = parseYamlFrontmatter(content);

      expect(result).toEqual({
        name: 'foo',
        version: 1.0,
      });
    });

    it('handles frontmatter with nested objects', () => {
      const content = `---
name: foo
metadata:
  author: John
  tags:
    - tag1
    - tag2
---
Body`;

      const result = parseYamlFrontmatter(content);

      expect(result).toEqual({
        name: 'foo',
        metadata: {
          author: 'John',
          tags: ['tag1', 'tag2'],
        },
      });
    });

    it('handles missing frontmatter', () => {
      const content = 'Just regular content\nNo frontmatter here.';
      const result = parseYamlFrontmatter(content);
      expect(result).toBeNull();
    });

    it('handles frontmatter at very start (no leading whitespace)', () => {
      const content = `---
key: value
---
Body`;

      const result = parseYamlFrontmatter(content);
      expect(result).toEqual({ key: 'value' });
    });

    it('returns null if frontmatter has leading whitespace', () => {
      const content = ` 
---
key: value
---
Body`;

      const result = parseYamlFrontmatter(content);
      expect(result).toBeNull();
    });

    it('handles empty frontmatter', () => {
      const content = `---
---
Body content`;

      const result = parseYamlFrontmatter(content);
      expect(result).toEqual({});
    });

    it('handles frontmatter with only opening delimiter', () => {
      const content = `---
key: value
Body content (no closing delimiter)`;

      const result = parseYamlFrontmatter(content);
      expect(result).toBeNull();
    });

    it('handles multiline string values', () => {
      const content = `---
description: |
  This is a multiline
  description that spans
  multiple lines
---
Body`;

      const result = parseYamlFrontmatter(content);

      expect(result).toEqual({
        description: 'This is a multiline\ndescription that spans\nmultiple lines\n',
      });
    });
  });

  describe('parseGherkinScenarios', () => {
    // Test ID: extractor-gherkin
    it('extracts scenarios', () => {
      const content = `Feature: User login

Scenario: Successful login
  Given I am on the login page
  When I enter valid credentials
  Then I should be logged in

Scenario: Failed login
  Given I am on the login page
  When I enter invalid credentials
  Then I should see an error message`;

      const result = parseGherkinScenarios(content);

      expect(result).toEqual([
        {
          name: 'Successful login',
          steps: [
            'Given I am on the login page',
            'When I enter valid credentials',
            'Then I should be logged in',
          ],
        },
        {
          name: 'Failed login',
          steps: [
            'Given I am on the login page',
            'When I enter invalid credentials',
            'Then I should see an error message',
          ],
        },
      ]);
    });

    it('handles scenarios with And/But steps', () => {
      const content = `Scenario: Complex flow
  Given I am logged in
  And I have items in my cart
  When I proceed to checkout
  But I have no payment method
  Then I should see payment form`;

      const result = parseGherkinScenarios(content);

      expect(result).toEqual([
        {
          name: 'Complex flow',
          steps: [
            'Given I am logged in',
            'And I have items in my cart',
            'When I proceed to checkout',
            'But I have no payment method',
            'Then I should see payment form',
          ],
        },
      ]);
    });

    it('handles content without scenarios', () => {
      const content = 'Just regular text\nNo Gherkin scenarios here.';
      const result = parseGherkinScenarios(content);
      expect(result).toEqual([]);
    });

    it('handles empty content', () => {
      const result = parseGherkinScenarios('');
      expect(result).toEqual([]);
    });

    it('handles scenario with no steps', () => {
      const content = `Scenario: Empty scenario
Feature description here`;

      const result = parseGherkinScenarios(content);

      expect(result).toEqual([
        {
          name: 'Empty scenario',
          steps: [],
        },
      ]);
    });

    it('handles scenarios with indented steps', () => {
      const content = `Scenario: Indented steps
    Given step with extra indentation
  When step with normal indentation
Then step with no indentation`;

      const result = parseGherkinScenarios(content);

      expect(result).toEqual([
        {
          name: 'Indented steps',
          steps: [
            'Given step with extra indentation',
            'When step with normal indentation',
            'Then step with no indentation',
          ],
        },
      ]);
    });
  });
});
