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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'limps-headless-audit-'));
}

describe('generateReport', () => {
  it('writes JSON and Markdown when format is both', () => {
    const dir = mkdtemp();
    const analysisPath = path.join(dir, 'analysis.json');
    const inventoryPath = path.join(dir, 'component-inventory.json');
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
              action: 'NO_LEGACY_RADIX_MATCH',
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
    fs.writeFileSync(
      inventoryPath,
      JSON.stringify(
        {
          components: [
            {
              path: 'src/MyDialog.tsx',
              name: 'MyDialog',
              exportType: 'default',
              propsInterface: 'MyDialogProps',
              dependencies: ['Dialog', 'Button'],
            },
          ],
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = generateReport({
      inputs: { analysis: analysisPath, inventory: inventoryPath },
      outputDir: dir,
      format: 'both',
      title: 'Test Report',
    });

    expect(result.report.metadata.version).toBe('1.0.0');
    expect(result.report.summary.totalComponents).toBe(1);
    expect(result.report.issues.length).toBeGreaterThanOrEqual(0);
    expect(result.report.compliance?.length).toBe(1);
    expect(result.report.inventory?.length).toBe(1);
    expect(result.jsonPath).toBeDefined();
    expect(result.markdownPath).toBeDefined();
    expect(fs.existsSync(result.jsonPath!)).toBe(true);
    expect(fs.existsSync(result.markdownPath!)).toBe(true);

    const md = fs.readFileSync(result.markdownPath!, 'utf-8');
    expect(md).toContain('# Test Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Compliance');
    expect(md).toContain('## Components');
    expect(md).toContain('MyDialog');

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

  it('respects backend classification when creating analysis issues', () => {
    const dir = mkdtemp();
    const analysisPath = path.join(dir, 'analysis.json');
    fs.writeFileSync(
      analysisPath,
      JSON.stringify({
        results: [
          {
            component: 'BaseDialog',
            filePath: 'src/BaseDialog.tsx',
            recommendation: {
              primitive: 'Dialog',
              package: '@radix-ui/react-dialog',
              confidence: 90,
              action: 'LEGACY_RADIX_MATCH_STRONG',
              reason: 'Strong legacy Radix match',
            },
            matches: [],
            analysis: {},
            isAmbiguous: false,
          },
          {
            component: 'UnknownPopover',
            filePath: 'src/UnknownPopover.tsx',
            recommendation: {
              primitive: 'Popover',
              package: '@radix-ui/react-popover',
              confidence: 60,
              action: 'LEGACY_RADIX_MATCH_POSSIBLE',
              reason: 'Moderate legacy Radix match',
            },
            matches: [],
            analysis: {},
            isAmbiguous: false,
          },
          {
            component: 'RadixDialog',
            filePath: 'src/RadixDialog.tsx',
            recommendation: {
              primitive: 'Dialog',
              package: '@radix-ui/react-dialog',
              confidence: 85,
              action: 'LEGACY_RADIX_MATCH_STRONG',
              reason: 'Strong legacy Radix match',
            },
            matches: [],
            analysis: {},
            isAmbiguous: false,
          },
          {
            component: 'CustomWidget',
            filePath: 'src/CustomWidget.tsx',
            recommendation: {
              primitive: null,
              package: null,
              confidence: 0,
              action: 'NO_LEGACY_RADIX_MATCH',
              reason: 'No legacy Radix match detected',
            },
            matches: [],
            analysis: {},
            isAmbiguous: false,
          },
        ],
      }),
      'utf-8'
    );
    const inventoryPath = path.join(dir, 'inventory.json');
    fs.writeFileSync(
      inventoryPath,
      JSON.stringify({
        components: [
          { path: 'src/BaseDialog.tsx', name: 'BaseDialog', backend: 'base', mixedUsage: false, importSources: [], evidence: [], exportsComponent: true, exportedNames: ['BaseDialog'] },
          { path: 'src/UnknownPopover.tsx', name: 'UnknownPopover', backend: 'unknown', mixedUsage: false, importSources: [], evidence: [], exportsComponent: true, exportedNames: ['UnknownPopover'] },
          { path: 'src/RadixDialog.tsx', name: 'RadixDialog', backend: 'radix', mixedUsage: false, importSources: [], evidence: [], exportsComponent: true, exportedNames: ['RadixDialog'] },
          { path: 'src/CustomWidget.tsx', name: 'CustomWidget', backend: 'unknown', mixedUsage: false, importSources: [], evidence: [], exportsComponent: true, exportedNames: ['CustomWidget'] },
        ],
      }),
      'utf-8'
    );

    const result = generateReport({
      inputs: { analysis: analysisPath, inventory: inventoryPath },
      outputDir: dir,
      format: 'json',
    });

    const migrationIssues = result.report.issues.filter(
      (issue) => issue.category === 'migration'
    );
    const issueLocations = migrationIssues.map((issue) => issue.location).sort();
    expect(issueLocations).toEqual(['src/RadixDialog.tsx', 'src/UnknownPopover.tsx']);
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
      expect(result.data.outputDir).toBe('.limps-headless/reports');
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
        inventory: '/i.json',
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

describe('headless_run_audit tool', () => {
  it('tool name and schema are defined', () => {
    expect(runAuditTool.name).toBe('headless_run_audit');
    expect(runAuditTool.inputSchema).toBe(runAuditInputSchema);
  });
});

describe('headless_generate_report tool', () => {
  it('tool name and schema are defined', () => {
    expect(generateReportTool.name).toBe('headless_generate_report');
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

// Test ID: report-backend-summary
describe('report-backend-summary', () => {
  it('includes backendCounts and legacyRadixCount when inventory is provided', () => {
    const dir = mkdtemp();
    const inventoryPath = path.join(dir, 'inventory.json');
    fs.writeFileSync(
      inventoryPath,
      JSON.stringify([
        {
          path: 'src/Dialog.tsx',
          name: 'Dialog',
          backend: 'radix',
          mixedUsage: false,
          importSources: ['@radix-ui/react-dialog'],
          evidence: ['asChild'],
          exportsComponent: true,
          exportedNames: ['Dialog'],
        },
        {
          path: 'src/Button.tsx',
          name: 'Button',
          backend: 'base',
          mixedUsage: false,
          importSources: ['@base-ui-components/react'],
          evidence: ['render'],
          exportsComponent: true,
          exportedNames: ['Button'],
        },
        {
          path: 'src/Mixed.tsx',
          name: 'MixedComponent',
          backend: 'mixed',
          mixedUsage: true,
          importSources: ['@radix-ui/react-tooltip', '@base-ui-components/react'],
          evidence: [],
          exportsComponent: true,
          exportedNames: ['MixedComponent'],
        },
      ]),
      'utf-8'
    );

    const result = generateReport({
      inputs: { inventory: inventoryPath },
      outputDir: dir,
      format: 'json',
    });

    expect(result.report.summary.backendCounts).toBeDefined();
    expect(result.report.summary.backendCounts!.radix).toBe(1);
    expect(result.report.summary.backendCounts!.base).toBe(1);
    expect(result.report.summary.backendCounts!.mixed).toBe(1);
    expect(result.report.summary.legacyRadixCount).toBe(2); // radix + mixed
    expect(result.report.summary.migrationReadiness).toBeDefined();
  });

  it('does not include backend summary when no inventory', () => {
    const dir = mkdtemp();
    const analysisPath = path.join(dir, 'analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify({ results: [] }), 'utf-8');

    const result = generateReport({
      inputs: { analysis: analysisPath },
      outputDir: dir,
      format: 'json',
    });

    expect(result.report.summary.backendCounts).toBeUndefined();
    expect(result.report.summary.legacyRadixCount).toBeUndefined();
    expect(result.report.summary.migrationReadiness).toBeUndefined();
  });
});

// Test ID: report-migration-section
describe('report-migration-section', () => {
  it('includes migration section in markdown output', () => {
    const dir = mkdtemp();
    const inventoryPath = path.join(dir, 'inventory.json');
    fs.writeFileSync(
      inventoryPath,
      JSON.stringify([
        {
          path: 'src/Dialog.tsx',
          name: 'Dialog',
          backend: 'radix',
          mixedUsage: false,
          importSources: ['@radix-ui/react-dialog'],
          evidence: ['asChild'],
          exportsComponent: true,
          exportedNames: ['Dialog'],
        },
      ]),
      'utf-8'
    );

    const result = generateReport({
      inputs: { inventory: inventoryPath },
      outputDir: dir,
      format: 'both',
      title: 'Migration Test Report',
    });

    const md = fs.readFileSync(result.markdownPath!, 'utf-8');
    expect(md).toContain('## Migration');
    expect(md).toContain('dependencies');
    expect(md).toContain('legacy Radix UI');
    expect(md).toContain('Dialog');
  });

  it('includes backend breakdown in summary section', () => {
    const dir = mkdtemp();
    const inventoryPath = path.join(dir, 'inventory.json');
    fs.writeFileSync(
      inventoryPath,
      JSON.stringify([
        {
          path: 'src/Dialog.tsx',
          name: 'Dialog',
          backend: 'radix',
          mixedUsage: false,
          importSources: ['@radix-ui/react-dialog'],
          evidence: [],
          exportsComponent: true,
          exportedNames: ['Dialog'],
        },
        {
          path: 'src/Button.tsx',
          name: 'Button',
          backend: 'base',
          mixedUsage: false,
          importSources: ['@base-ui-components/react'],
          evidence: [],
          exportsComponent: true,
          exportedNames: ['Button'],
        },
      ]),
      'utf-8'
    );

    const result = generateReport({
      inputs: { inventory: inventoryPath },
      outputDir: dir,
      format: 'markdown',
    });

    const md = fs.readFileSync(result.markdownPath!, 'utf-8');
    expect(md).toContain('**Backend breakdown:**');
    expect(md).toContain('radix 1');
    expect(md).toContain('base 1');
    expect(md).toContain('**Legacy Radix components:**');
    expect(md).toContain('**Migration readiness:**');
  });

  it('includes migration readiness indicator in markdown', () => {
    const dir = mkdtemp();
    const inventoryPath = path.join(dir, 'inventory.json');
    // 100% radix = urgent
    fs.writeFileSync(
      inventoryPath,
      JSON.stringify([
        {
          path: 'src/Dialog.tsx',
          name: 'Dialog',
          backend: 'radix',
          mixedUsage: false,
          importSources: ['@radix-ui/react-dialog'],
          evidence: [],
          exportsComponent: true,
          exportedNames: ['Dialog'],
        },
      ]),
      'utf-8'
    );

    const result = generateReport({
      inputs: { inventory: inventoryPath },
      outputDir: dir,
      format: 'markdown',
    });

    const md = fs.readFileSync(result.markdownPath!, 'utf-8');
    expect(md).toContain('**Migration readiness:** urgent');
  });
});
