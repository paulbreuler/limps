import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { getPackageVersion, getPackageName } from '../../src/utils/version.js';
import { outputJson } from '../../src/cli/json-output.js';

vi.mock('../../src/cli/json-output.js', async () => {
  const actual = await vi.importActual('../../src/cli/json-output.js');
  return {
    ...(actual as Record<string, unknown>),
    outputJson: vi.fn(),
  };
});

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

  it('outputs JSON when --json is used without --check', async () => {
    const { default: VersionCommand } = await import('../../src/commands/version.js');
    const packageName = getPackageName();
    const currentVersion = getPackageVersion();

    render(<VersionCommand options={{ check: false, json: true }} />);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(outputJson).toHaveBeenCalledTimes(1);
    const payload = (outputJson as unknown as { mock: { calls: [unknown[]] } }).mock.calls[0][0];
    expect(payload).toEqual({
      success: true,
      data: {
        packageName,
        currentVersion,
      },
    });
  });

  it('outputs JSON when --json and --check are used', async () => {
    const currentVersion = getPackageVersion();
    const newerVersion = '999.999.999';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ version: newerVersion }),
    });

    const { default: VersionCommand } = await import('../../src/commands/version.js');
    const packageName = getPackageName();

    render(<VersionCommand options={{ check: true, json: true }} />);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(outputJson).toHaveBeenCalledTimes(1);
    const payload = (outputJson as unknown as { mock: { calls: [unknown[]] } }).mock.calls[0][0];
    expect(payload).toEqual({
      success: true,
      data: {
        packageName,
        currentVersion,
        latestVersion: newerVersion,
        updateAvailable: true,
      },
    });
  });
});
