/**
 * Tests for WhatsNew component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { WhatsNew } from '../../src/components/WhatsNew.js';

// Mock the changelog utilities
vi.mock('../../src/utils/changelog.js', () => ({
  getChangelogForVersion: vi.fn(),
  formatChangelogForDisplay: vi.fn((text) => text),
}));

// Mock version-state utility
vi.mock('../../src/utils/version-state.js', () => ({
  updateLastSeenVersion: vi.fn(),
}));

import { getChangelogForVersion, formatChangelogForDisplay } from '../../src/utils/changelog.js';
import { updateLastSeenVersion } from '../../src/utils/version-state.js';

const mockGetChangelog = getChangelogForVersion as ReturnType<typeof vi.fn>;
const mockFormatChangelog = formatChangelogForDisplay as ReturnType<typeof vi.fn>;
const mockUpdateVersion = updateLastSeenVersion as ReturnType<typeof vi.fn>;

describe('WhatsNew', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders What's New box with version", () => {
    mockGetChangelog.mockReturnValue('## [1.2.0]\n\n### Features\n\n* New feature');

    const { lastFrame } = render(<WhatsNew version="1.2.0" />);

    const output = lastFrame() ?? '';
    expect(output).toContain("What's New");
    expect(output).toContain('1.2.0');
  });

  it('displays changelog content when available', () => {
    const changelog = '## [1.2.0]\n\n### Features\n\n* New feature';
    mockGetChangelog.mockReturnValue(changelog);
    mockFormatChangelog.mockReturnValue(changelog);

    const { lastFrame } = render(<WhatsNew version="1.2.0" />);

    const output = lastFrame() ?? '';
    expect(output).toContain('Features');
    expect(output).toContain('New feature');
  });

  it('shows fallback message when changelog is not found', () => {
    mockGetChangelog.mockReturnValue(null);

    const { lastFrame } = render(<WhatsNew version="1.2.0" />);

    const output = lastFrame() ?? '';
    expect(output).toContain("What's New");
    expect(output).toContain('1.2.0');
    expect(output).toContain('is now available');
  });

  it('calls updateLastSeenVersion after rendering', async () => {
    mockGetChangelog.mockReturnValue('## [1.2.0]\n\n### Features\n\n* New feature');

    render(<WhatsNew version="1.2.0" />);

    // Wait for useEffect to run
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(mockUpdateVersion).toHaveBeenCalledWith('1.2.0');
  });

  it('calls onDismiss callback if provided', async () => {
    const onDismiss = vi.fn();
    mockGetChangelog.mockReturnValue('## [1.2.0]\n\n### Features\n\n* New feature');

    render(<WhatsNew version="1.2.0" onDismiss={onDismiss} />);

    // Wait for useEffect to run
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onDismiss).toHaveBeenCalled();
  });

  it('formats changelog before displaying', () => {
    const rawChangelog = '## [1.2.0]\n\nSee [link](url)';
    const formattedChangelog = '## [1.2.0]\n\nSee link';
    mockGetChangelog.mockReturnValue(rawChangelog);
    mockFormatChangelog.mockReturnValue(formattedChangelog);

    render(<WhatsNew version="1.2.0" />);

    expect(mockFormatChangelog).toHaveBeenCalledWith(rawChangelog);
  });
});
