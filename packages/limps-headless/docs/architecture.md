---
title: limps-headless Architecture
---

# Architecture Overview

limps-headless is a limps extension that extracts headless UI contracts (e.g. Radix UI), generates semantic signatures, and detects drift across versions.

## Core Pipeline

1. **Fetcher**
   - Resolves versions and downloads type definitions
   - Supports both individual `@radix-ui/react-*` packages and the unified `radix-ui` package

2. **Extractor**
   - Parses TypeScript `.d.ts` content
   - Builds `ExtractedPrimitive` contracts (props, sub-components, exports)

3. **Signatures**
   - Converts raw contracts into behavioral signatures
   - Classifies state, composition, and rendering patterns

4. **Cache**
   - Stores extracted contracts and signatures by primitive/version
   - Speeds up repeated tool usage

5. **Analyzer**
   - Analyzes local components and matches against cached signatures
   - Produces recommendations and confidence scores

6. **Differ**
   - Compares two versions of a primitive
   - Emits breaking, warning, and info changes

## What the diff does (planning and expansion)

The diff exists to answer one question: **“If I upgrade Radix from one version to another, what will break or change in the public API?”** so you can plan migration work and avoid surprises.

### What it compares

It compares **contracts**, not source code or runtime behavior:

- **Contract** = the extracted public API of each Radix primitive: props (name, type, required), subcomponents, and their types, as derived from the published `.d.ts` files.
- For each primitive (or a subset), the differ loads the contract at the **from-version** and at the **to-version**, then diffs them.

So you get a **type-level change report**: what was added, removed, or changed in the types consumers rely on.

### What it produces

A list of **changes**, each with:

- **Severity**: `breaking` (will break your code), `warning` (may break or need review), `info` (additive, usually safe).
- **Type**: e.g. `prop_removed`, `prop_required`, `type_narrowed`, `prop_added`, `type_widened`, `subcomponent_removed`, etc.
- **Target**: which primitive, subcomponent, or prop the change applies to.
- **Description**: a short, human-readable “what changed” (e.g. “Prop 'open' is now required on Root”).
- **Migration hint**: actionable guidance (e.g. “Add an explicit value for this prop”) so you can plan fixes.

So the diff is **planning-oriented**: it expands raw type deltas into descriptions and migration hints, not just “prop X changed”.

### Flow (from-version → to-version)

1. Resolve from-version and to-version (e.g. `1.0.0` and `latest`).
2. For each primitive to diff: fetch/extract contract at from-version, fetch/extract contract at to-version (using cache when possible).
3. Compare contracts: diff props (added/removed/required/type changes) and subcomponents; classify each change (breaking/warning/info) and generate description + migration hint.
4. Return a single list of changes plus summary counts.

### When to use it

- **Before upgrading**: run diff from your current version (from-version) to the new version (to-version) to see breaking changes and plan code updates.
- **With check-updates**: `headless_check_updates` can include a diff from current to latest so you see what an upgrade would entail.

## Provider System

Providers wrap library-specific behaviors (version resolution, type fetching) and enable future support for non-Radix component libraries.

Default provider: `radix`

## Tool Layer

MCP tools are thin wrappers around the pipeline:

- `headless_list_primitives`
- `headless_extract_primitive`
- `headless_analyze_component`
- `headless_diff_versions`
- `headless_check_updates`

Each tool accepts an optional `provider` parameter (default: `radix`).
