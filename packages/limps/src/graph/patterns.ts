export const PATTERNS = {
  // Plan references
  planId: /(?:plan\s*)?(\d{4})(?:[-\s]+([\w-]+))?/gi,
  planRef: /\bplan\s+(\d{4})(?:#(\d{3}))?/gi,

  // Agent references
  agentId: /(\d{4})#(\d{3})/g,
  agentHeader: /^#\s*Agent\s+(\d{3}):\s*(.+)$/gm,

  // Features
  featureHeader: /^###\s*(?:#(\d+):?\s*)?(.+)$/gm,
  featureStatus: /Status:\s*`?(GAP|WIP|PASS|BLOCKED)`?/gi,

  // Files (in frontmatter or inline)
  frontmatterFiles: /^files:\s*\[([^\]]+)\]/m,
  inlineFile: /`([\w/.-]+\.(?:ts|js|tsx|jsx|md|json|py|rs|go|sql))`/g,

  // Dependencies
  frontmatterDepends: /^(?:depends|depends_on):\s*\[([^\]]+)\]/m,
  inlineDepends: /depends\s+(?:on\s+)?(?:agent\s+)?(\d{4}#\d{3}|\d{3})/gi,

  // Tags
  frontmatterTags: /^tags:\s*\[([^\]]+)\]/m,
  inlineTag: /#([\w-]+)/g,

  // Status
  frontmatterStatus: /^status:\s*(\w+)/m,
} as const;
