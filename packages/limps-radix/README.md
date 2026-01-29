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

## MCP Tools

### `radix_list_primitives`

List all available Radix UI primitives with package names and descriptions.

**Input**

```json
{
  "version": "latest"
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
  "version": "latest"
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
- `tools` — MCP tool definitions (`radix_list_primitives`, `radix_extract_primitive`).

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
  "primitive": "dialog"
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

## Notes

- If the unified `radix-ui` package is available for a version, the tools may return `radix-ui` as the package name instead of individual `@radix-ui/react-*` packages.
- Cache entries are stored by version and primitive name to speed up repeated tool calls.

## License

MIT
