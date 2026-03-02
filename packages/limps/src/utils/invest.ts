import type { InvestReport, InvestCriteria } from '../documents/types.js';

export function validateInvest(frontmatter: Record<string, unknown>, body: string): InvestReport {
  const warnings: string[] = [];

  const dependencies = Array.isArray(frontmatter.dependencies) ? frontmatter.dependencies : [];
  const files = Array.isArray(frontmatter.files) ? frontmatter.files : [];

  // I - Independent
  const independent =
    dependencies.length === 0 ||
    (dependencies as unknown[]).every((d) => typeof d === 'string' && d.length > 0);

  // Helper to extract section content between ## headings using split
  const extractSection = (heading: string): string => {
    const lines = body.split('\n');
    let capturing = false;
    const result: string[] = [];
    for (const line of lines) {
      if (line.match(new RegExp(`^## ${heading}\\s*$`))) {
        capturing = true;
        continue;
      }
      if (capturing && /^## /.test(line)) {
        break;
      }
      if (capturing) {
        result.push(line);
      }
    }
    return result.join('\n').trim();
  };

  // N - Negotiable: ## Task section with substantive content
  const taskContent = extractSection('Task');
  const negotiable = taskContent.length > 0 && !/^[\s\-*[\]xX]+$/m.test(taskContent);

  // V - Valuable: ## Acceptance Criteria with >=1 item
  const acContent = extractSection('Acceptance Criteria');
  const acItems = acContent.match(/^\s*-/gm) ?? [];
  const valuable = acItems.length >= 1;

  // E - Estimable: files <= 8 (warn at >5)
  if (files.length > 5 && files.length <= 8) {
    warnings.push(`files count (${files.length}) is high, consider splitting (warn threshold: 5)`);
  }
  const estimable = files.length <= 8;
  if (files.length > 8) {
    warnings.push(`files count (${files.length}) exceeds max (8); task is too large`);
  }

  // S - Small: AC items <= 10
  const small = acItems.length <= 10;
  if (acItems.length > 10) {
    warnings.push(`Too many acceptance criteria (${acItems.length}); split the task`);
  }

  // T - Testable: ## Verification with at least one step
  const verifyContent = extractSection('Verification');
  const testable = verifyContent.length > 0;

  const criteria: InvestCriteria = {
    independent,
    negotiable,
    valuable,
    estimable,
    small,
    testable,
  };

  const passedCount = Object.values(criteria).filter(Boolean).length;
  const score = Math.round((passedCount / 6) * 100);

  return {
    score,
    criteria,
    warnings,
    pass: score >= 60,
  };
}
