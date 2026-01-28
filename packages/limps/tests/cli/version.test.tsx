import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { getPackageVersion } from '../../src/utils/version.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('version command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays current version', async () => {
    const { default: VersionCommand } = await import('../../src/commands/version.js');

    const { lastFrame } = render(<VersionCommand options={{ check: false }} />);

    const output = lastFrame() ?? '';
    const currentVersion = getPackageVersion();
    expect(output).toContain(currentVersion);
  });

  it('shows version in correct format', async () => {
    const { default: VersionCommand } = await import('../../src/commands/version.js');

    const { lastFrame } = render(<VersionCommand options={{ check: false }} />);

    const output = lastFrame() ?? '';
    const currentVersion = getPackageVersion();
    // Should show version like "limps 1.0.2" or similar
    expect(output).toMatch(/\d+\.\d+\.\d+/);
    expect(output).toContain(currentVersion);
  });

  it('displays update information when --check flag is used and update is available', async () => {
    const currentVersion = getPackageVersion();
    // Mock a newer version than current
    const newerVersion = '999.999.999';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ version: newerVersion }),
    });

    const { default: VersionCommand } = await import('../../src/commands/version.js');

    const { lastFrame } = render(<VersionCommand options={{ check: true }} />);

    // Wait for async fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const output = lastFrame() ?? '';
    // Should indicate an update is available
    expect(output).toContain(newerVersion);
    expect(output).toContain(currentVersion);
    expect(output.toLowerCase()).toMatch(/update available|latest version/i);
  });

  it('shows up-to-date message when --check flag is used and no update is available', async () => {
    const currentVersion = getPackageVersion();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ version: currentVersion }),
    });

    const { default: VersionCommand } = await import('../../src/commands/version.js');

    const { lastFrame } = render(<VersionCommand options={{ check: true }} />);

    // Wait for async fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const output = lastFrame() ?? '';
    expect(output).toContain(currentVersion);
    // Should indicate no update needed
    expect(output.toLowerCase()).toMatch(/up.?to.?date|latest|current/i);
  });

  it('handles network errors gracefully when checking for updates', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { default: VersionCommand } = await import('../../src/commands/version.js');

    const { lastFrame } = render(<VersionCommand options={{ check: true }} />);

    // Wait for async fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const output = lastFrame() ?? '';
    const currentVersion = getPackageVersion();
    // Should still show version even if check fails
    expect(output).toContain(currentVersion);
  });
});
