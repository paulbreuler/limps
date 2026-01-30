/**
 * Tests for headless_analyze_component MCP tool.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AnalysisResult, ComponentAnalysis } from '../src/types/index.js';

const mocks = vi.hoisted(() => ({
  analyzeComponent: vi.fn(),
  scoreAgainstSignatures: vi.fn(),
  disambiguate: vi.fn(),
  isAmbiguous: vi.fn(),
  getSignatureFromCache: vi.fn(),
  getLatestResolution: vi.fn(),
  listCachedPrimitives: vi.fn(),
  listCachedVersions: vi.fn(),
}));

vi.mock('../src/analyzer/index.js', () => ({
  analyzeComponent: mocks.analyzeComponent,
  scoreAgainstSignatures: mocks.scoreAgainstSignatures,
  disambiguate: mocks.disambiguate,
  isAmbiguous: mocks.isAmbiguous,
}));

vi.mock('../src/cache/index.js', () => ({
  getSignatureFromCache: mocks.getSignatureFromCache,
  getLatestResolution: mocks.getLatestResolution,
}));

vi.mock('../src/cache/storage.js', () => ({
  listCachedPrimitives: mocks.listCachedPrimitives,
  listCachedVersions: mocks.listCachedVersions,
}));

const { handleAnalyzeComponent } = await import('../src/tools/analyze-component.js');

const baseAnalysis: ComponentAnalysis = {
  name: 'Modal',
  filePath: 'Modal.tsx',
  propsInterface: new Map(),
  subComponents: [],
  inferredStatePattern: 'binary',
  inferredCompositionPattern: 'compound',
  inferredRenderingPattern: 'portal-conditional',
  usesForwardRef: false,
  hasAsChild: false,
  ariaRoles: [],
  dataAttributes: [],
};

function setupDefaults() {
  mocks.analyzeComponent.mockResolvedValue(baseAnalysis);
  mocks.getLatestResolution.mockResolvedValue({
    version: '1.0.0',
    resolvedAt: new Date().toISOString(),
  });
  mocks.listCachedVersions.mockResolvedValue(['1.0.0']);
  mocks.listCachedPrimitives.mockResolvedValue(['Dialog']);
  mocks.getSignatureFromCache.mockResolvedValue({
    primitive: 'Dialog',
    package: '@radix-ui/react-dialog',
    version: '1.0.0',
    statePattern: 'binary',
    compositionPattern: 'compound',
    renderingPattern: 'portal-conditional',
    distinguishingProps: ['modal'],
    antiPatternProps: [],
    subComponents: [],
    similarTo: [],
  });
  mocks.isAmbiguous.mockReturnValue(false);
  mocks.disambiguate.mockImplementation((matches: any[]) => matches[0]);
}

describe('headless_analyze_component tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('returns ADOPT_RADIX for 70+', async () => {
    mocks.scoreAgainstSignatures.mockReturnValue([
      {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        confidence: 75,
        breakdown: {
          statePatternScore: 35,
          compositionScore: 25,
          propsSignatureScore: 20,
          accessibilityScore: 5,
          renderingScore: 10,
        },
        signals: { matched: [], missing: [], antiPatterns: [] },
      },
    ]);

    const result = await handleAnalyzeComponent({
      filePath: './tests/tmp-analyze/Modal.tsx',
    });
    const parsed = JSON.parse(result.content[0].text) as AnalysisResult;
    expect(parsed.recommendation.action).toBe('ADOPT_RADIX');
    expect(parsed.recommendation.confidence).toBeGreaterThanOrEqual(70);
  });

  it('returns CONSIDER_RADIX for 50-69', async () => {
    mocks.scoreAgainstSignatures.mockReturnValue([
      {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        confidence: 60,
        breakdown: {
          statePatternScore: 35,
          compositionScore: 15,
          propsSignatureScore: 10,
          accessibilityScore: 0,
          renderingScore: 0,
        },
        signals: { matched: [], missing: [], antiPatterns: [] },
      },
    ]);

    const result = await handleAnalyzeComponent({
      filePath: './tests/tmp-analyze/Modal.tsx',
    });
    const parsed = JSON.parse(result.content[0].text) as AnalysisResult;
    expect(parsed.recommendation.action).toBe('CONSIDER_RADIX');
  });

  it('returns CUSTOM_OK for <50', async () => {
    mocks.scoreAgainstSignatures.mockReturnValue([
      {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        confidence: 45,
        breakdown: {
          statePatternScore: 35,
          compositionScore: 0,
          propsSignatureScore: 0,
          accessibilityScore: 0,
          renderingScore: 0,
        },
        signals: { matched: [], missing: [], antiPatterns: [] },
      },
    ]);

    const result = await handleAnalyzeComponent({
      filePath: './tests/tmp-analyze/Modal.tsx',
    });
    const parsed = JSON.parse(result.content[0].text) as AnalysisResult;
    expect(parsed.recommendation.action).toBe('CUSTOM_OK');
  });

  it('flags ambiguous matches', async () => {
    mocks.scoreAgainstSignatures.mockReturnValue([
      {
        primitive: 'Dialog',
        package: '@radix-ui/react-dialog',
        confidence: 55,
        breakdown: {
          statePatternScore: 35,
          compositionScore: 15,
          propsSignatureScore: 5,
          accessibilityScore: 0,
          renderingScore: 0,
        },
        signals: { matched: [], missing: [], antiPatterns: [] },
      },
      {
        primitive: 'Popover',
        package: '@radix-ui/react-popover',
        confidence: 50,
        breakdown: {
          statePatternScore: 35,
          compositionScore: 10,
          propsSignatureScore: 5,
          accessibilityScore: 0,
          renderingScore: 0,
        },
        signals: { matched: [], missing: [], antiPatterns: [] },
      },
    ]);
    mocks.isAmbiguous.mockReturnValue(true);

    const result = await handleAnalyzeComponent({
      filePath: './tests/tmp-analyze/Modal.tsx',
    });
    const parsed = JSON.parse(result.content[0].text) as AnalysisResult;
    expect(parsed.isAmbiguous).toBe(true);
  });

  it('handles file not found', async () => {
    mocks.analyzeComponent.mockRejectedValue(new Error('Failed to parse component file'));

    await expect(
      handleAnalyzeComponent({ filePath: './tests/tmp-analyze/Nope.tsx' })
    ).rejects.toThrow('Failed to parse component file');
  });
});
