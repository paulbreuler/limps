export interface LinkStats {
  sourceFiles: number;
  destinationFiles: number;
  resolvedReferences: number;
  unresolvedReferences: number;
}

export type LinkMap = Record<string, Record<string, number>>;

export function computeLinkStats(resolvedLinks: unknown, unresolvedLinks: unknown): LinkStats {
  const resolved = isLinkMap(resolvedLinks) ? resolvedLinks : {};
  const unresolved = isLinkMap(unresolvedLinks) ? unresolvedLinks : {};

  const sourceFiles = new Set<string>([...Object.keys(resolved), ...Object.keys(unresolved)]);
  const destinationFiles = new Set<string>();

  let resolvedReferences = 0;
  for (const [, destinations] of Object.entries(resolved)) {
    for (const [destination, count] of Object.entries(destinations)) {
      destinationFiles.add(destination);
      resolvedReferences += toNonNegativeInt(count);
    }
  }

  let unresolvedReferences = 0;
  for (const [, destinations] of Object.entries(unresolved)) {
    for (const [, count] of Object.entries(destinations)) {
      unresolvedReferences += toNonNegativeInt(count);
    }
  }

  return {
    sourceFiles: sourceFiles.size,
    destinationFiles: destinationFiles.size,
    resolvedReferences,
    unresolvedReferences,
  };
}

export interface RuntimeStatusLabelInput {
  daemonRunning: boolean;
  links: LinkStats;
  mcpEnabled: boolean;
  mcpConnected: boolean;
}

export function buildRuntimeStatusLabel(input: RuntimeStatusLabelInput): string {
  const daemonLabel = input.daemonRunning ? 'daemon:up' : 'daemon:down';
  const linksLabel = `links:r${input.links.resolvedReferences}/u${input.links.unresolvedReferences}`;
  const mcpLabel = input.mcpEnabled ? `mcp:${input.mcpConnected ? 'up' : 'down'}` : 'mcp:off';
  return `limps ${daemonLabel} ${linksLabel} ${mcpLabel}`;
}

function toNonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isLinkMap(value: unknown): value is LinkMap {
  if (!value || typeof value !== 'object') return false;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (!nested || typeof nested !== 'object') return false;
    for (const count of Object.values(nested as Record<string, unknown>)) {
      if (typeof count !== 'number' || !Number.isFinite(count)) return false;
    }
  }
  return true;
}
