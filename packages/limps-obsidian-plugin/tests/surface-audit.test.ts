import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditObsidianSurfaces } from '../src/graph/surfaceAudit.js';

test('auditObsidianSurfaces summarizes markdown/canvas/base files', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-surface-audit-'));
  const plansPath = join(root, 'plans');
  const planA = join(plansPath, '1000-surface-a');
  const planB = join(plansPath, '1001-surface-b');
  mkdirSync(planA, { recursive: true });
  mkdirSync(planB, { recursive: true });

  writeFileSync(join(planA, '1000-surface-a-plan.md'), '# Plan A\n', 'utf8');
  writeFileSync(join(planA, 'Board.canvas'), '{}\n', 'utf8');
  writeFileSync(join(planA, 'Data.base'), 'views:\n  - type: table\n    name: Table\n', 'utf8');

  writeFileSync(join(planB, '1001-surface-b-plan.md'), '# Plan B\n', 'utf8');
  writeFileSync(join(planB, 'Empty.canvas'), '   \n', 'utf8');
  writeFileSync(join(planB, 'Empty.base'), ' \n', 'utf8');

  const report = auditObsidianSurfaces(plansPath);
  assert.equal(report.planDirectories, 2);
  assert.equal(report.markdownFiles, 2);
  assert.equal(report.canvasFiles, 2);
  assert.equal(report.baseFiles, 2);
  assert.equal(report.emptyCanvasFiles.length, 2);
  assert.equal(report.emptyBaseFiles.length, 1);
});

test('auditObsidianSurfaces returns empty report for missing plans path', () => {
  const report = auditObsidianSurfaces('/definitely/missing/path');
  assert.equal(report.planDirectories, 0);
  assert.equal(report.markdownFiles, 0);
  assert.equal(report.canvasFiles, 0);
  assert.equal(report.baseFiles, 0);
  assert.match(report.warnings.join('\n'), /does not exist/);
});
