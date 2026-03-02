import { describe, it, expect } from 'vitest';
import { validateInvest } from '../../src/utils/invest.js';

describe('validateInvest', () => {
  it('should return perfect score for fully valid agent task', () => {
    const frontmatter = {
      dependencies: [],
      files: ['src/auth.ts', 'src/auth.test.ts'],
    };
    const body = `
## Task
Add JWT authentication middleware that validates Bearer tokens.

## Acceptance Criteria
- [ ] Returns 401 with no token
- [ ] Returns 200 with valid token

## Files to Modify
- src/auth.ts

## Verification
\`\`\`bash
npm test src/auth.test.ts
\`\`\`
    `;
    const result = validateInvest(frontmatter, body);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.criteria.independent).toBe(true);
    expect(result.criteria.valuable).toBe(true);
    expect(result.criteria.testable).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('should warn when files count exceeds 5', () => {
    const frontmatter = {
      dependencies: [],
      files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
    };
    const body = `
## Task
Some task with context.

## Acceptance Criteria
- [ ] Item 1

## Verification
\`\`\`bash
npm test
\`\`\`
    `;
    const result = validateInvest(frontmatter, body);
    expect(result.criteria.estimable).toBe(true);
    expect(result.warnings.some((w) => w.includes('files'))).toBe(true);
  });

  it('should fail estimable when files count exceeds 8', () => {
    const frontmatter = {
      dependencies: [],
      files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts', 'h.ts', 'i.ts'],
    };
    const body = `
## Task
Some task with context.

## Acceptance Criteria
- [ ] Item 1

## Verification
\`\`\`bash
npm test
\`\`\`
    `;
    const result = validateInvest(frontmatter, body);
    expect(result.criteria.estimable).toBe(false);
    expect(result.warnings.some((w) => w.includes('files'))).toBe(true);
  });

  it('should fail testable if no Verification section', () => {
    const frontmatter = { dependencies: [], files: ['a.ts'] };
    const body = `
## Task
Some task.

## Acceptance Criteria
- [ ] Item 1
    `;
    const result = validateInvest(frontmatter, body);
    expect(result.criteria.testable).toBe(false);
  });

  it('should fail valuable if no Acceptance Criteria section', () => {
    const frontmatter = { dependencies: [], files: [] };
    const body = `
## Task
Some task.

## Verification
\`\`\`bash
npm test
\`\`\`
    `;
    const result = validateInvest(frontmatter, body);
    expect(result.criteria.valuable).toBe(false);
  });

  it('should fail small if AC items exceed 10', () => {
    const frontmatter = { dependencies: [], files: ['a.ts'] };
    const items = Array.from({ length: 11 }, (_, i) => `- [ ] Item ${i + 1}`).join('\n');
    const body = `
## Task
Some task with context.

## Acceptance Criteria
${items}

## Verification
\`\`\`bash
npm test
\`\`\`
    `;
    const result = validateInvest(frontmatter, body);
    expect(result.criteria.small).toBe(false);
    expect(result.warnings.some((w) => w.includes('acceptance criteria'))).toBe(true);
  });

  it('should fail negotiable if no Task section', () => {
    const frontmatter = { dependencies: [], files: ['a.ts'] };
    const body = `
## Acceptance Criteria
- [ ] Item 1

## Verification
\`\`\`bash
npm test
\`\`\`
    `;
    const result = validateInvest(frontmatter, body);
    expect(result.criteria.negotiable).toBe(false);
  });
});
