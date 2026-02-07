/**
 * npm registry client for fetching Radix package metadata.
 */

import type { PackageInfo, PrimitiveInfo } from '../types/index.js';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const RADIX_SCOPE = '@radix-ui';
const UNIFIED_PACKAGE_NAME = 'radix-ui';
const UNIFIED_MIN_VERSION = '1.4.3';

// Cache for version resolution (short TTL in memory)
const versionCache = new Map<string, { version: string; timestamp: number }>();
const VERSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Known Radix UI primitives - used as fallback and for validation
 */
export const KNOWN_PRIMITIVES = [
  'accordion',
  'alert-dialog',
  'aspect-ratio',
  'avatar',
  'checkbox',
  'collapsible',
  'context-menu',
  'dialog',
  'dropdown-menu',
  'form',
  'hover-card',
  'label',
  'menubar',
  'navigation-menu',
  'popover',
  'progress',
  'radio-group',
  'scroll-area',
  'select',
  'separator',
  'slider',
  'slot',
  'switch',
  'tabs',
  'toast',
  'toggle',
  'toggle-group',
  'toolbar',
  'tooltip',
  'visually-hidden',
] as const;

export type KnownPrimitive = (typeof KNOWN_PRIMITIVES)[number];

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

function parseVersion(version: string): ParsedVersion {
  const [core, prerelease] = version.split('-');
  const [major, minor, patch] = core.split('.').map((part) => Number(part));
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0,
    prerelease,
  };
}

function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);

  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;

  if (left.prerelease && !right.prerelease) return -1;
  if (!left.prerelease && right.prerelease) return 1;
  return 0;
}

export function isVersionAtLeast(version: string, minVersion: string): boolean {
  return compareVersions(version, minVersion) >= 0;
}

/**
 * Convert primitive name to package name.
 * @example "dialog" -> "@radix-ui/react-dialog"
 */
export function primitiveToPackage(primitive: string): string {
  const normalized = primitive.toLowerCase().replace(/\s+/g, '-');
  return `${RADIX_SCOPE}/react-${normalized}`;
}

/**
 * Extract primitive name from package name.
 * @example "@radix-ui/react-dialog" -> "dialog"
 */
export function packageToPrimitive(packageName: string): string {
  const match = packageName.match(/@radix-ui\/react-(.+)/);
  if (!match) {
    throw new Error(`Invalid Radix package name: ${packageName}`);
  }
  return match[1];
}

/**
 * Fetch package info from npm registry.
 */
export async function fetchPackageInfo(packageName: string): Promise<PackageInfo> {
  const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Package not found: ${packageName}`);
    }
    throw new Error(`Failed to fetch package info: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    name: string;
    'dist-tags': Record<string, string>;
    versions: Record<string, unknown>;
  };

  return {
    name: data.name,
    version: data['dist-tags'].latest,
    distTags: data['dist-tags'],
  };
}

function resolveVersionFromPackageInfo(packageInfo: PackageInfo, versionHint: string): string {
  if (versionHint === 'latest' || versionHint === '*') {
    return packageInfo.distTags.latest;
  }
  if (packageInfo.distTags[versionHint]) {
    return packageInfo.distTags[versionHint];
  }
  if (versionHint.startsWith('^') || versionHint.startsWith('~')) {
    return versionHint.slice(1);
  }
  return versionHint;
}

/**
 * Resolve a version hint for a specific package.
 */
export async function resolvePackageVersion(
  packageName: string,
  versionHint: string = 'latest'
): Promise<string> {
  const cacheKey = `${packageName}@${versionHint}`;

  const cached = versionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < VERSION_CACHE_TTL_MS) {
    return cached.version;
  }

  const packageInfo = await fetchPackageInfo(packageName);
  const version = resolveVersionFromPackageInfo(packageInfo, versionHint);

  versionCache.set(cacheKey, { version, timestamp: Date.now() });
  return version;
}

/**
 * Resolve a version hint (e.g., "latest", "^1.0.0") to an actual version.
 */
export async function resolveVersion(
  primitive: string,
  versionHint: string = 'latest'
): Promise<string> {
  const packageName = primitiveToPackage(primitive);
  return resolvePackageVersion(packageName, versionHint);
}

/**
 * List all available Radix primitives.
 * Returns known primitives with their package names.
 */
export async function listPrimitives(_version?: string): Promise<PrimitiveInfo[]> {
  // For now, return known primitives
  // In a full implementation, we could query the radix-ui meta package
  // or npm search API for all @radix-ui/react-* packages

  return KNOWN_PRIMITIVES.map((name) => ({
    name,
    package: primitiveToPackage(name),
    description: getPrimitiveDescription(name),
  }));
}

/**
 * Check if the unified "radix-ui" package is available and meets the minimum version.
 */
export async function queryUnifiedPackage(
  minVersion: string = UNIFIED_MIN_VERSION
): Promise<{ available: boolean; version?: string }> {
  try {
    const packageInfo = await fetchPackageInfo(UNIFIED_PACKAGE_NAME);
    const version = resolveVersionFromPackageInfo(packageInfo, 'latest');
    return {
      available: isVersionAtLeast(version, minVersion),
      version,
    };
  } catch (_error) {
    return { available: false };
  }
}

/**
 * Get a brief description for a primitive.
 */
function getPrimitiveDescription(primitive: string): string {
  const descriptions: Record<string, string> = {
    accordion: 'A vertically stacked set of interactive headings',
    'alert-dialog': 'A modal dialog that interrupts the user',
    'aspect-ratio': 'Displays content within a desired ratio',
    avatar: 'An image element with a fallback',
    checkbox: 'A control that allows the user to toggle between states',
    collapsible: 'An interactive component which expands/collapses content',
    'context-menu': 'A menu displayed on right-click',
    dialog: 'A modal dialog overlay',
    'dropdown-menu': 'A menu displayed from a trigger button',
    form: 'Form primitives with built-in validation',
    'hover-card': 'A popup that appears on hover',
    label: 'Renders an accessible label for form controls',
    menubar: 'A visually persistent menu common in desktop apps',
    'navigation-menu': 'A collection of links for site navigation',
    popover: 'A popup that appears from a trigger',
    progress: 'Displays an indicator showing task completion',
    'radio-group': 'A set of checkable buttons—only one can be checked',
    'scroll-area': 'Augments native scroll with custom scrollbars',
    select: 'A dropdown list of options',
    separator: 'Visually separates content',
    slider: 'An input for selecting a value from a range',
    slot: 'Merges its props onto its immediate child',
    switch: 'A control that toggles between on and off',
    tabs: 'A set of layered content panels',
    toast: 'A succinct message displayed temporarily',
    toggle: 'A two-state button',
    'toggle-group': 'A set of two-state buttons',
    toolbar: 'A container for grouping a set of controls',
    tooltip: 'A popup that displays information on hover',
    'visually-hidden': 'Hides content visually but keeps it accessible',
  };

  return descriptions[primitive] || '';
}
