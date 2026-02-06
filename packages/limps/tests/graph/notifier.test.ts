import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Notifier } from '../../src/graph/notifier.js';
import type { ConflictReport } from '../../src/graph/conflict-detector.js';

describe('Notifier', () => {
  const sampleReport: ConflictReport = {
    type: 'file_contention',
    severity: 'error',
    message: 'Test conflict',
    entities: ['agent:0001#001', 'agent:0001#002'],
  };

  describe('log channel', () => {
    it('logs conflicts to console.error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const notifier = new Notifier({ channels: ['log'] });
      await notifier.notify([sampleReport]);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] file_contention: Test conflict')
      );
      errorSpy.mockRestore();
    });

    it('does nothing for empty reports', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const notifier = new Notifier({ channels: ['log'] });
      await notifier.notify([]);

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('file channel', () => {
    let filePath: string;

    beforeEach(() => {
      filePath = join(tmpdir(), `notifier-test-${Date.now()}.jsonl`);
    });

    afterEach(() => {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    });

    it('appends JSON lines to file', async () => {
      const notifier = new Notifier({ channels: ['file'], filePath });
      await notifier.notify([sampleReport]);

      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.type).toBe('file_contention');
      expect(parsed.timestamp).toBeDefined();
    });

    it('skips when no filePath configured', async () => {
      const notifier = new Notifier({ channels: ['file'] });
      await notifier.notify([sampleReport]);
      // No error thrown
    });
  });

  describe('webhook channel', () => {
    it('posts to webhook URL', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

      const notifier = new Notifier({
        channels: ['webhook'],
        webhookUrl: 'http://localhost:9999/test',
      });
      await notifier.notify([sampleReport]);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:9999/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      fetchSpy.mockRestore();
    });

    it('handles webhook errors gracefully', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Connection refused'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const notifier = new Notifier({
        channels: ['webhook'],
        webhookUrl: 'http://localhost:9999/fail',
      });
      await notifier.notify([sampleReport]);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Webhook notification failed'));
      fetchSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
