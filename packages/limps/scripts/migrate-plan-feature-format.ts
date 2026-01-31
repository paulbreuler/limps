#!/usr/bin/env npx tsx
/**
 * Migrate plan files from legacy feature format to new format.
 *
 * Target: limps 2.7.0+. Run this migration if you have plan files using the
 * legacy format before upgrading; a future release may drop backward compat.
 *
 * Legacy format (deprecated):
 *   ## Feature N: Title
 *   **Status:** GAP
 *
 * New format (create-feature-plan / create_plan output):
 *   ### #N: Title
 *   Status: `GAP`
 *
 * Usage:
 *   npm run migrate:plan-feature-format [-- plans-directory]
 *   npx tsx scripts/migrate-plan-feature-format.ts [plans-directory]
 *
 * Default plans directory: ../../plans (repo plans from packages/limps)
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PLANS_PATH = join(__dirname, '../../..', 'plans');

/**
 * Transform legacy feature headers to new format.
 * ## Feature N: Title → ### #N: Title
 */
function migrateFeatureHeaders(content: string): string {
  return content.replace(/^## Feature (\d+): (.+)$/gm, '### #$1: $2');
}

/**
 * Transform legacy status lines to new format.
 * **Status:** GAP → Status: `GAP`
 */
function migrateStatusLines(content: string): string {
  return content.replace(/^\*\*Status:\*\*\s+(GAP|WIP|PASS|BLOCKED)$/gim, 'Status: `$1`');
}

/**
 * Apply both migrations. Returns new content if changed.
 */
function migratePlanContent(content: string): { migrated: string; changed: boolean } {
  const afterHeaders = migrateFeatureHeaders(content);
  const afterStatus = migrateStatusLines(afterHeaders);
  const changed = content !== afterStatus;
  return { migrated: afterStatus, changed };
}

function findPlanFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findPlanFiles(fullPath));
      } else if (entry.name.endsWith('-plan.md') || entry.name === 'plan.md') {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return results;
}

function main(): void {
  const plansPath = process.argv[2] ?? DEFAULT_PLANS_PATH;
  const files = findPlanFiles(plansPath);

  if (files.length === 0) {
    console.log(`No plan files found under ${plansPath}`);
    process.exit(0);
  }

  console.log(`Checking ${files.length} plan file(s) in ${plansPath}\n`);

  let migratedCount = 0;
  let errorCount = 0;

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const { migrated, changed } = migratePlanContent(content);

      if (changed) {
        writeFileSync(filePath, migrated, 'utf-8');
        console.log(`Migrated: ${filePath}`);
        migratedCount++;
      }
    } catch (err) {
      console.error(`Error: ${filePath}`, err);
      errorCount++;
    }
  }

  console.log('\n----------------------------------------');
  console.log('Migration complete:');
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped:  ${files.length - migratedCount - errorCount}`);
  console.log(`  Errors:   ${errorCount}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

main();
