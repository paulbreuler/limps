#!/usr/bin/env npx tsx
/**
 * Migration script to add YAML frontmatter to legacy agent files.
 * Only migrates files that:
 * - Don't already have frontmatter
 * - Are not in a "completed" directory
 * - Don't have PASS status
 */

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { migrateAgentFile, parseAgentFile } from '../src/agent-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLANS_PATH = join(__dirname, '../../../plans');

function findAgentFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip completed directories
        if (entry.name === 'completed') {
          console.log(`  Skipping completed directory: ${fullPath}`);
          continue;
        }
        results.push(...findAgentFiles(fullPath));
      } else if (entry.name.endsWith('.agent.md')) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }

  return results;
}

function needsMigration(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Already has frontmatter
    if (content.startsWith('---')) {
      return false;
    }

    // Parse to check status
    const parsed = parseAgentFile(filePath, content);
    if (!parsed) {
      return false;
    }

    // Don't migrate PASS files
    if (parsed.frontmatter.status === 'PASS') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function main() {
  console.log('Scanning for legacy agent files...\n');

  const agentFiles = findAgentFiles(PLANS_PATH);
  console.log(`Found ${agentFiles.length} agent files total\n`);

  const toMigrate = agentFiles.filter(needsMigration);
  console.log(`Files needing migration: ${toMigrate.length}\n`);

  if (toMigrate.length === 0) {
    console.log('No files need migration.');
    return;
  }

  console.log('Migrating files:\n');

  let migrated = 0;
  let failed = 0;

  for (const filePath of toMigrate) {
    const relativePath = filePath.replace(PLANS_PATH, 'plans');
    process.stdout.write(`  ${relativePath}... `);

    const result = migrateAgentFile(filePath);
    if (result) {
      console.log(`✓ (status: ${result.frontmatter.status})`);
      migrated++;
    } else {
      console.log('✗ failed');
      failed++;
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${failed} failed`);
}

main();
