/**
 * Tests for theme color system.
 */

import { describe, it, expect } from 'vitest';
import {
  getStatusColor,
  getWorkTypeColor,
  getScoreColor,
  statusColors,
  workTypeColors,
  textColors,
} from '../../src/theme/colors.js';

describe('theme/colors', () => {
  describe('getStatusColor', () => {
    it('returns success color for PASS', () => {
      expect(getStatusColor('PASS')).toBe(statusColors.success);
    });

    it('returns warning color for WIP', () => {
      expect(getStatusColor('WIP')).toBe(statusColors.warning);
    });

    it('returns error color for BLOCKED', () => {
      expect(getStatusColor('BLOCKED')).toBe(statusColors.error);
    });

    it('returns default color for GAP', () => {
      expect(getStatusColor('GAP')).toBe(statusColors.default);
    });
  });

  describe('getWorkTypeColor', () => {
    it('returns correct color for each work type', () => {
      expect(getWorkTypeColor('feature')).toBe(workTypeColors.feature);
      expect(getWorkTypeColor('bug')).toBe(workTypeColors.bug);
      expect(getWorkTypeColor('refactor')).toBe(workTypeColors.refactor);
      expect(getWorkTypeColor('docs')).toBe(workTypeColors.docs);
      expect(getWorkTypeColor('unknown')).toBe(workTypeColors.unknown);
    });
  });

  describe('getScoreColor', () => {
    it('returns success color for high scores (>=80%)', () => {
      expect(getScoreColor(80, 100)).toBe(statusColors.success);
      expect(getScoreColor(100, 100)).toBe(statusColors.success);
      expect(getScoreColor(90, 100)).toBe(statusColors.success);
    });

    it('returns warning color for medium scores (50-79%)', () => {
      expect(getScoreColor(50, 100)).toBe(statusColors.warning);
      expect(getScoreColor(75, 100)).toBe(statusColors.warning);
      expect(getScoreColor(79, 100)).toBe(statusColors.warning);
    });

    it('returns error color for low scores (<50%)', () => {
      expect(getScoreColor(0, 100)).toBe(statusColors.error);
      expect(getScoreColor(25, 100)).toBe(statusColors.error);
      expect(getScoreColor(49, 100)).toBe(statusColors.error);
    });
  });

  describe('color constants', () => {
    it('defines status colors', () => {
      expect(statusColors.success).toBe('green');
      expect(statusColors.warning).toBe('yellow');
      expect(statusColors.error).toBe('red');
      expect(statusColors.info).toBe('blue');
      expect(statusColors.default).toBe('white');
    });

    it('defines work type colors', () => {
      expect(workTypeColors.feature).toBe('cyan');
      expect(workTypeColors.bug).toBe('red');
      expect(workTypeColors.refactor).toBe('yellow');
      expect(workTypeColors.docs).toBe('blue');
      expect(workTypeColors.unknown).toBe('gray');
    });

    it('defines text colors', () => {
      expect(textColors.primary).toBe('white');
      expect(textColors.muted).toBe('gray');
    });
  });
});
