/**
 * Tests for CLI policy flags and config (Agent 0 #5).
 */

import { describe, it, expect } from 'vitest';
import {
  parseBackendMode,
  parseMigrationThreshold,
  DEFAULT_RUN_AUDIT_OPTIONS,
} from '../src/cli/flags.js';
import { resolveHeadlessConfig } from '../src/config.js';

describe('cli flags', () => {
  describe('parseBackendMode', () => {
    it('parses auto, base, radix-legacy', () => {
      expect(parseBackendMode('auto')).toBe('auto');
      expect(parseBackendMode('base')).toBe('base');
      expect(parseBackendMode('radix-legacy')).toBe('radix-legacy');
    });
    it('defaults to auto for unknown', () => {
      expect(parseBackendMode('')).toBe('auto');
      expect(parseBackendMode('unknown')).toBe('auto');
    });
  });

  describe('parseMigrationThreshold', () => {
    it('parses low, medium, high', () => {
      expect(parseMigrationThreshold('low')).toBe('low');
      expect(parseMigrationThreshold('medium')).toBe('medium');
      expect(parseMigrationThreshold('high')).toBe('high');
    });
    it('defaults to medium for unknown', () => {
      expect(parseMigrationThreshold('')).toBe('medium');
    });
  });

  describe('DEFAULT_RUN_AUDIT_OPTIONS', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_RUN_AUDIT_OPTIONS.backendMode).toBe('auto');
      expect(DEFAULT_RUN_AUDIT_OPTIONS.migrationThreshold).toBe('medium');
      expect(DEFAULT_RUN_AUDIT_OPTIONS.failOnMixed).toBe(false);
      expect(DEFAULT_RUN_AUDIT_OPTIONS.includeLegacy).toBe(true);
    });
  });
});

describe('config', () => {
  it('resolveHeadlessConfig returns defaults when no overrides', () => {
    const c = resolveHeadlessConfig();
    expect(c.audit?.backendMode).toBe('auto');
    expect(c.audit?.migrationThreshold).toBe('medium');
  });
  it('resolveHeadlessConfig merges overrides', () => {
    const c = resolveHeadlessConfig({ audit: { backendMode: 'base' } });
    expect(c.audit?.backendMode).toBe('base');
    expect(c.audit?.migrationThreshold).toBe('medium');
  });
});
