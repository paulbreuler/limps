# @sudosandwich/limps-radix

limps extension for Radix UI contract extraction, semantic analysis, and drift detection.

## Installation

```bash
npm install @sudosandwich/limps-radix
```

**Peer Dependencies**: Requires `@sudosandwich/limps@^2.0.0`.

## Quick Start

1. Add the extension to your limps config (see below).
2. Restart your limps MCP server.
3. Use the MCP tools from your client (Cursor, Claude Desktop, etc.).

Example `limps.config.json`:

```json
{
  "extensions": ["@sudosandwich/limps-radix"]
}
```

## CLI

You can use the standalone CLI for local workflows. **Run from your project directory** so that `analyze` can resolve file paths (paths are relative to the current working directory):

```bash
cd /path/to/your/react-app
limps-radix list --version latest
limps-radix extract dialog
limps-radix analyze src/components/ui/button.tsx
limps-radix audit --files src/components/ui/button.tsx src/components/ui/select.tsx   # full audit; output in .limps-radix/reports
limps-radix diff <from-version> --to <to-version>   # e.g. diff 1.0.0 --to latest
limps-radix check-updates --refresh
```

**Audit output:** `limps-radix audit` writes to `.limps-radix/reports/` (override with `-o`): `audit-report.md`, `audit-report.json`, `analysis.json`, `diff.json`, `updates.json`.

Pass `--json` to any command for raw JSON output.

## MCP Tools

Tool reference: see `docs/tools.md` for detailed schemas and examples.

### `radix_list_primitives`

List all available Radix UI primitives with package names and descriptions.

**Input**

```json
{
  "version": "latest",
  "provider": "radix"
}
```

**Output**

```json
{
  "version": "1.1.2",
  "primitives": [
    {
      "name": "dialog",
      "package": "@radix-ui/react-dialog",
      "description": "A modal dialog overlay"
    },
    {
      "name": "popover",
      "package": "@radix-ui/react-popover",
      "description": "A popup that appears from a trigger"
    }
  ]
}
```

### `radix_extract_primitive`

Extract the behavioral contract for a single Radix primitive, including sub-components, prop metadata, and semantic classification.

**Input**

```json
{
  "primitive": "dialog",
  "version": "latest",
  "provider": "radix"
}
```

**Output**

```json
{
  "primitive": "Dialog",
  "package": "@radix-ui/react-dialog",
  "version": "1.1.2",
  "behavior": {
    "statePattern": "binary",
    "compositionPattern": "compound",
    "renderingPattern": "portal-conditional"
  },
  "subComponents": [
    {
      "name": "Root",
      "props": [
        {
          "name": "open",
          "type": "boolean",
          "required": false,
          "category": "state"
        },
        {
          "name": "onOpenChange",
          "type": "(open: boolean) => void",
          "required": false,
          "category": "event"
        }
      ]
    },
    {
      "name": "Trigger",
      "props": [
        {
          "name": "asChild",
          "type": "boolean",
          "required": false,
          "category": "composition"
        }
      ]
    }
  ],
  "similarTo": ["AlertDialog", "Popover"],
  "disambiguationRule": "Dialog has modal=true by default; AlertDialog requires action confirmation"
}
```

### `radix_analyze_component`

Analyze a local component file and recommend a Radix primitive.

**Input**

```json
{
  "filePath": "src/components/MyDialog.tsx",
  "radixVersion": "latest",
  "threshold": 40,
  "provider": "radix"
}
```

### `radix_diff_versions`

**Purpose:** Answer “what will break or need attention if I upgrade Radix?” by comparing **two Radix versions** (not your code vs Radix). It diffs the public API contracts (props, subcomponents) of primitives between a from-version (e.g. your current) and a to-version (e.g. `latest`). Lists breaking changes, warnings, and info. Input: `fromVersion`, `toVersion`.

**Input**

```json
{
  "fromVersion": "1.0.0",
  "toVersion": "latest",
  "breakingOnly": false,
  "provider": "radix"
}
```

### `radix_check_updates`

Check for a newer Radix version and show changes since the last check.

**Input**

```json
{
  "refreshCache": false,
  "provider": "radix"
}
```

## API Reference

This package re-exports its core types, signatures, cache helpers, and tool definitions from `src/index.ts`.

### Types

- `ExtractedPrimitive` — Raw extraction from Radix `.d.ts` files.
- `BehaviorSignature` — Semantic behavioral contract used for comparisons.
- `PropDefinition` — Prop metadata with semantic classification flags.
- `SubComponentDefinition` — Sub-component structure and prop list.
- `RawProp` — Raw prop before classification.
- `PrimitiveInfo` — Info used by primitive listings.
- `PackageInfo` — npm registry package metadata.
- `StatePattern` / `CompositionPattern` / `RenderingPattern` — Behavioral pattern enums.

### Modules

- `cache` — File-based cache helpers for extracted data and signatures.
- `signatures` — Behavior signature generation utilities.
- `providers` — Provider registry for component libraries.
- `tools` — MCP tool definitions (`radix_list_primitives`, `radix_extract_primitive`, `radix_analyze_component`, `radix_diff_versions`, `radix_check_updates`).

## Configuration

limps supports extension-specific config via a top-level key in `limps.config.json`.

```json
{
  "extensions": ["@sudosandwich/limps-radix"],
  "radix": {
    "cacheDir": "~/Library/Application Support/limps-radix"
  }
}
```

**Options**

- `cacheDir` (optional): Base directory for the Radix cache. Defaults to `~/.limps-radix/cache`.

## Examples

### List primitives for a specific version

**Input**

```json
{
  "version": "1.1.2"
}
```

**Output**

```json
{
  "version": "1.1.2",
  "primitives": [
    {
      "name": "dialog",
      "package": "@radix-ui/react-dialog",
      "description": "A modal dialog overlay"
    },
    {
      "name": "popover",
      "package": "@radix-ui/react-popover",
      "description": "A popup that appears from a trigger"
    }
  ]
}
```

### Extract a primitive contract

**Input**

```json
{
  "primitive": "dialog",
  "provider": "radix"
}
```

**Output**

```json
{
  "primitive": "Dialog",
  "package": "@radix-ui/react-dialog",
  "version": "1.1.2",
  "behavior": {
    "statePattern": "binary",
    "compositionPattern": "compound",
    "renderingPattern": "portal-conditional"
  },
  "subComponents": [
    {
      "name": "Root",
      "props": [
        {
          "name": "open",
          "type": "boolean",
          "required": false,
          "category": "state"
        },
        {
          "name": "onOpenChange",
          "type": "(open: boolean) => void",
          "required": false,
          "category": "event"
        }
      ]
    },
    {
      "name": "Trigger",
      "props": [
        {
          "name": "asChild",
          "type": "boolean",
          "required": false,
          "category": "composition"
        }
      ]
    }
  ],
  "similarTo": ["AlertDialog", "Popover"],
  "disambiguationRule": "Dialog has modal=true by default; AlertDialog requires action confirmation"
}
```

## Troubleshooting

**"Type definitions not found"**  
We fetch types from unpkg at `dist/index.d.ts` (individual packages) or `dist/<primitive>.d.ts` (unified). The error now includes the URL(s) tried, HTTP status, and a link to unpkg so you can confirm the package layout. Common causes:

- **Older Radix versions** (e.g. 1.1.x): Some packages may not publish types at those paths; the unified `radix-ui` package is only used for 1.4.3+.
- **Cached version mismatch**: Diff/audit may resolve to a cached version (e.g. 1.1.15) that doesn’t have types at the expected path. Run `limps-radix check-updates --refresh` to refresh cache and prefer newer versions.

Errors are descriptive: they list the paths and status codes tried, and a browse link to the package on unpkg.

## Notes

- If the unified `radix-ui` package is available for a version, the tools may return `radix-ui` as the package name instead of individual `@radix-ui/react-*` packages.
- Cache entries are stored by version and primitive name to speed up repeated tool calls.
- Provider support is pluggable, but non-Radix providers may not support every tool yet.

## Links

- [Tool Reference](./docs/tools.md)
- [Architecture](./docs/architecture.md)
- [Providers](./docs/providers.md)

## License

MIT
