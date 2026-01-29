---
title: limps-radix Architecture
---

# Architecture Overview

limps-radix is a limps extension that extracts Radix UI contracts, generates semantic signatures, and detects drift across versions.

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

## Provider System

Providers wrap library-specific behaviors (version resolution, type fetching) and enable future support for non-Radix component libraries.

Default provider: `radix`

## Tool Layer

MCP tools are thin wrappers around the pipeline:

- `radix_list_primitives`
- `radix_extract_primitive`
- `radix_analyze_component`
- `radix_diff_versions`
- `radix_check_updates`

Each tool accepts an optional `provider` parameter (default: `radix`).
