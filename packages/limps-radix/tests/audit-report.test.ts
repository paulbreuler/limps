/**
 * Tests for the audit report pipeline (generate-report, run-audit, tools).
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { generateReport, runAudit } from '../src/audit/index.js';
import {
  runAuditInputSchema,
  generateReportInputSchema,
  handleRunAudit,
  handleGenerateReport,
  runAuditTool,
  generateReportTool,
} from '../src/tools/index.js';

function mkdtemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'limps-radix-audit-'));
}

describe('generateReport', () => {
  it('writes JSON and Markdown when format is both', () => {
    const dir = mkdtemp();
    const analysisPath = path.join(dir, 'analysis.json');
    fs.writeFileSync(
      analysisPath,
      JSON.stringify({
        results: [
          {
            component: 'MyDialog',
            filePath: 'src/MyDialog.tsx',
            recommendation: {
              primitive: null,
              package: null,
              confidence: 0,
              action: 'CUSTOM_OK',
              reason: 'No Radix signatures cached.',
            },
            matches: [],
            analysis: {},
            isAmbiguous: false,
          },
        ],
      }),
      'utf-8'
    );

    const result = generateReport({
      inputs: { analysis: analysisPath },
      outputDir: dir,
      format: 'both',
      title: 'Test Report',
    });

    expect(result.report.metadata.version).toBe('1.0.0');
    expect(result.report.summary.totalComponents).toBe(1);
    expect(result.report.issues.length).toBeGreaterThanOrEqual(0);
    expect(result.report.compliance?.length).toBe(1);
    expect(result.jsonPath).toBeDefined();
    expect(result.markdownPath).toBeDefined();
    expect(fs.existsSync(result.jsonPath!)).toBe(true);
    expect(fs.existsSync(result.markdownPath!)).toBe(true);

    const md = fs.readFileSync(result.markdownPath!, 'utf-8');
    expect(md).toContain('# Test Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Compliance');

    const reportJson = JSON.parse(fs.readFileSync(result.jsonPath!, 'utf-8'));
    expect(reportJson.summary.totalComponents).toBe(1);
  });

  it('accepts optional diff and checkUpdates paths', () => {
    const dir = mkdtemp();
    const analysisPath = path.join(dir, 'analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify({ results: [] }), 'utf-8');
    const diffPath = path.join(dir, 'diff.json');
    fs.writeFileSync(
      diffPath,
      JSON.stringify({
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
        hasBreakingChanges: true,
        summary: { totalChanges: 1, breaking: 1, warnings: 0, info: 0 },
        changes: [],
      }),
      'utf-8'
    );
    const updatesPath = path.join(dir, 'updates.json');
    fs.writeFileSync(
      updatesPath,
      JSON.stringify({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        hasUpdate: true,
        diff: { fromVersion: '1.0.0', toVersion: '2.0.0', hasBreakingChanges: true, summary: { totalChanges: 1, breaking: 1, warnings: 0, info: 0 }, changes: [] },
      }),
      'utf-8'
    );

    const result = generateReport({
      inputs: { analysis: analysisPath, diff: diffPath, checkUpdates: updatesPath },
      outputDir: dir,
      format: 'both',
    });

    expect(result.report.contraventions.length).toBeGreaterThanOrEqual(0);
    expect(result.report.summary.contraventions).toBeDefined();
  });

  it('works with no analysis path (empty results)', () => {
    const dir = mkdtemp();
    const result = generateReport({
      inputs: {},
      outputDir: dir,
      format: 'json',
    });

    expect(result.report.summary.totalComponents).toBe(0);
    expect(result.report.issues).toEqual([]);
    expect(result.jsonPath).toBeDefined();
  });
});

describe('runAuditInputSchema', () => {
  it('accepts empty input with defaults', () => {
    const result = runAuditInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.radixVersion).toBe('latest');
      expect(result.data.outputDir).toBe('.limps-radix/reports');
      expect(result.data.format).toBe('both');
    }
  });

  it('accepts scope with files and primitives', () => {
    const result = runAuditInputSchema.safeParse({
      scope: { files: ['src/Button.tsx'], primitives: ['dialog'] },
      outputDir: '/tmp/reports',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope?.files).toEqual(['src/Button.tsx']);
      expect(result.data.scope?.primitives).toEqual(['dialog']);
      expect(result.data.outputDir).toBe('/tmp/reports');
    }
  });

  it('accepts discovery options', () => {
    const result = runAuditInputSchema.safeParse({
      discovery: { rootDir: 'src/ui', includePatterns: ['**/*.tsx'], excludePatterns: ['**/*.test.*'] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discovery?.rootDir).toBe('src/ui');
      expect(result.data.discovery?.includePatterns).toEqual(['**/*.tsx']);
    }
  });
});

describe('generateReportInputSchema', () => {
  it('requires inputs object', () => {
    const result = generateReportInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts inputs with only analysis path', () => {
    const result = generateReportInputSchema.safeParse({
      inputs: { analysis: '/path/to/analysis.json' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inputs.analysis).toBe('/path/to/analysis.json');
      expect(result.data.format).toBe('both');
    }
  });

  it('accepts all optional inputs', () => {
    const result = generateReportInputSchema.safeParse({
      inputs: {
        analysis: '/a.json',
        diff: '/d.json',
        checkUpdates: '/u.json',
      },
      outputDir: '/out',
      format: 'markdown',
      title: 'My Audit',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inputs.diff).toBe('/d.json');
      expect(result.data.format).toBe('markdown');
      expect(result.data.title).toBe('My Audit');
    }
  });
});

describe('radix_run_audit tool', () => {
  it('tool name and schema are defined', () => {
    expect(runAuditTool.name).toBe('radix_run_audit');
    expect(runAuditTool.inputSchema).toBe(runAuditInputSchema);
  });
});

describe('radix_generate_report tool', () => {
  it('tool name and schema are defined', () => {
    expect(generateReportTool.name).toBe('radix_generate_report');
    expect(generateReportTool.inputSchema).toBe(generateReportInputSchema);
  });

  it('handleGenerateReport returns summary content', async () => {
    const dir = mkdtemp();
    const analysisPath = path.join(dir, 'analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify({ results: [] }), 'utf-8');

    const result = await handleGenerateReport({
      inputs: { analysis: analysisPath },
      outputDir: dir,
      format: 'both',
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.outputDir).toBeDefined();
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.totalComponents).toBe(0);
  });
});

describe('runAudit', () => {
  it('produces report files in output dir', async () => {
    const dir = mkdtemp();
    const result = await runAudit({
      scope: { files: [] },
      outputDir: dir,
      format: 'both',
    });

    expect(result.outputDir).toBe(dir);
    expect(result.report.metadata.generatedAt).toBeDefined();
    expect(result.report.summary.totalComponents).toBe(0);
    expect(result.analysisPath).toBeDefined();
    expect(result.diffPath).toBeDefined();
    expect(result.updatesPath).toBeDefined();
    expect(fs.existsSync(result.jsonPath!)).toBe(true);
    expect(fs.existsSync(result.markdownPath!)).toBe(true);
  }, 35000);

  it('handleRunAudit returns summary content', async () => {
    const dir = mkdtemp();
    const result = await handleRunAudit({
      scope: { files: [] },
      outputDir: dir,
      format: 'json',
    });

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.outputDir).toBe(dir);
    expect(parsed.summary).toBeDefined();
    expect(parsed.analysisPath).toBeDefined();
    expect(parsed.diffPath).toBeDefined();
    expect(parsed.updatesPath).toBeDefined();
  }, 35000);
});
