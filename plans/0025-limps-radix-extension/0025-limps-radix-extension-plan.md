---
title: limps Radix Extension
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature]
created: 2026-01-26
updated: 2026-01-27
---

# limps-radix-extension

## Overview

Create `@sudosandwich/limps-radix` - an MCP extension for Radix UI contract extraction, semantic analysis, and drift detection.

**Vision:** Apply runi's "collapse uncertainty into truth" pattern to UI component contracts. Detect when components drift from Radix patterns, verify AI-generated components follow best practices, track breaking changes across Radix releases.

**Extensibility:** Designed to eventually support other component libraries (shadcn, Ark UI, Headless UI) through a pluggable provider architecture.

## Technical Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Language | TypeScript 5.9+ | Type safety, limps compatibility |
| Type Analysis | ts-morph | Wraps TypeScript compiler API nicely |
| Type Source | npm/unpkg CDN | Fetch published .d.ts files |
| Caching | File-based JSON | Version-tagged, local-first |
| MCP | @modelcontextprotocol/sdk | Standard MCP tooling |
| Testing | Vitest | Fast, TypeScript-native |

---

## Feature 0: limps Extension API

**Status:** GAP

### Description

Add extension system to limps core. This is a PREREQUISITE - must be done in the limps repo before limps-radix can work.

### Gherkin

```gherkin
Feature: limps extension loading

  Scenario: Load extension from config
    Given limps.config.json contains extensions: ["@sudosandwich/limps-radix"]
    When limps starts
    Then it loads the limps-radix package
    And registers its MCP tools
    And calls onInit with extension context

  Scenario: Extension provides tools
    Given limps-radix extension is loaded
    When MCP client lists tools
    Then radix_list_primitives is available
    And radix_extract_primitive is available
    And radix_analyze_component is available

  Scenario: Extension has isolated data directory
    Given limps-radix extension is loaded
    When it accesses context.dataDir
    Then path is ~/.limps/extensions/limps-radix/

  Scenario: Extension config from limps.config.json
    Given limps.config.json has radix: { cacheDir: ".cache" }
    When limps-radix onInit runs
    Then context.config.cacheDir equals ".cache"
```

### TDD Cycles

1. **Extension interface test**
   - Test: LimpsExtension interface exists with tools array
   - Impl: Add interface to limps types
   - Refactor: Export from main

2. **Extension loader test**
   - Test: loadExtensions() imports from node_modules
   - Impl: Dynamic import extension packages
   - Refactor: Handle missing packages gracefully

3. **Tool registration test**
   - Test: Extension tools appear in MCP tool list
   - Impl: Merge extension.tools into server tools
   - Refactor: Namespace collision detection

4. **Extension context test**
   - Test: onInit receives dataDir and config
   - Impl: Create ExtensionContext, call lifecycle hooks
   - Refactor: Ensure dataDir created

### Files

**In limps repo:**
- `src/extensions/types.ts` (create)
- `src/extensions/loader.ts` (create)
- `src/extensions/context.ts` (create)
- `src/server.ts` (modify - integrate extension loading)

---

## Feature 1: Project Scaffolding

**Status:** GAP

### Description

Set up `@sudosandwich/limps-radix` npm package with proper structure for a limps MCP extension.

### Gherkin

```gherkin
Feature: limps-radix package structure

  Scenario: Package installable
    Given user runs npm install @sudosandwich/limps-radix
    When installation completes
    Then limps-radix is in node_modules
    And peer dependency limps ^2.0.0 is required

  Scenario: Extension exports tools
    Given limps-radix is imported
    When accessing default export
    Then it's a valid LimpsExtension
    And tools array contains radix tools

  Scenario: TypeScript types available
    Given limps-radix is installed
    When importing types
    Then ExtractedPrimitive is available
    And BehaviorSignature is available
```

### TDD Cycles

1. **Package structure test**
   - Test: Package.json has correct fields
   - Impl: Create package.json with peer deps
   - Refactor: Add keywords, repo info

2. **Extension export test**
   - Test: Default export is LimpsExtension
   - Impl: Create src/index.ts with extension object
   - Refactor: Re-export types

3. **Build test**
   - Test: tsup produces dist/index.js and .d.ts
   - Impl: Configure tsconfig and tsup
   - Refactor: Add prepublishOnly script

### Files

- `package.json` (create)
- `tsconfig.json` (create)
- `src/index.ts` (create)
- `src/types/index.ts` (create)

---

## Feature 2: Radix Type Fetcher

**Status:** GAP

### Description

Fetch Radix primitive type definitions from npm registry/unpkg CDN. Support version pinning and "latest" resolution.

### Gherkin

```gherkin
Feature: Fetch Radix types from CDN

  Scenario: Fetch types for specific version
    Given primitive "dialog" and version "1.0.5"
    When fetching types
    Then returns content from unpkg.com/@radix-ui/react-dialog@1.0.5/dist/index.d.ts

  Scenario: Resolve "latest" to actual version
    Given primitive "dialog" and version "latest"
    When resolving version
    Then queries npm registry for @radix-ui/react-dialog
    And returns actual semver like "1.1.2"

  Scenario: List all Radix primitives
    Given version "latest"
    When listing primitives
    Then queries radix-ui meta package
    And returns all available primitive names

  Scenario: Handle non-existent primitive
    Given primitive "nonexistent"
    When fetching types
    Then returns error with helpful message
```

### TDD Cycles

1. **npm registry query test**
   - Test: resolveVersion("dialog", "latest") returns semver
   - Impl: Fetch from registry.npmjs.org
   - Refactor: Cache version resolution

2. **unpkg fetch test**
   - Test: fetchTypes("dialog", "1.0.5") returns .d.ts content
   - Impl: Fetch from unpkg CDN
   - Refactor: Handle 404, network errors

3. **primitive list test**
   - Test: listPrimitives() returns known primitives
   - Impl: Parse radix-ui package.json dependencies
   - Refactor: Filter to react-* packages only

4. **error handling test**
   - Test: fetchTypes("fake", "1.0.0") throws meaningful error
   - Impl: Check response status, provide context
   - Refactor: Retry logic for transient failures

### Files

- `src/fetcher/npm-registry.ts` (create)
- `src/fetcher/unpkg.ts` (create)
- `src/fetcher/index.ts` (create)

---

## Feature 3: Type Extractor (ts-morph)

**Status:** GAP

### Description

Parse Radix .d.ts files using ts-morph to extract component contracts: props interfaces, sub-components, exports.

### Gherkin

```gherkin
Feature: Extract component contract from types

  Scenario: Extract Dialog primitive
    Given Dialog .d.ts content
    When extracting
    Then finds DialogRoot, DialogTrigger, DialogContent interfaces
    And extracts open, onOpenChange, modal props
    And identifies controlled/uncontrolled patterns

  Scenario: Extract props with JSDoc
    Given interface with /** @default false */ comment
    When extracting props
    Then defaultValue is "false"
    And description is extracted

  Scenario: Handle interface extension
    Given interface Props extends Primitive.Props
    When extracting
    Then includes inherited props
    And marks inheritance source
```

### TDD Cycles

1. **ts-morph setup test**
   - Test: Can create Project with string source
   - Impl: Initialize ts-morph with in-memory FS
   - Refactor: Configure compiler options

2. **interface extraction test**
   - Test: findInterfaces finds DialogRootProps
   - Impl: Use getInterfaces(), filter by pattern
   - Refactor: Handle re-exports

3. **prop extraction test**
   - Test: extractProps returns name, type, required
   - Impl: Use getProperties(), getType()
   - Refactor: Handle optional (?) syntax

4. **JSDoc extraction test**
   - Test: extractJSDoc returns @default value
   - Impl: Use getJsDocs(), parse tags
   - Refactor: Handle multi-line comments

5. **sub-component detection test**
   - Test: findSubComponents returns Root, Trigger, Content
   - Impl: Match *Props pattern, extract base name
   - Refactor: Handle irregular naming

### Files

- `src/extractor/project.ts` (create)
- `src/extractor/interface.ts` (create)
- `src/extractor/props.ts` (create)
- `src/extractor/jsdoc.ts` (create)
- `src/extractor/index.ts` (create)

---

## Feature 4: Semantic Props Classifier

**Status:** GAP

### Description

Classify extracted props into semantic categories: state control, event handlers, configuration, composition.

### Gherkin

```gherkin
Feature: Semantic prop classification

  Scenario: Classify state control props
    Given prop named "open" with type "boolean"
    When classifying
    Then isStateControl is true

  Scenario: Classify event handlers
    Given prop named "onOpenChange"
    When classifying
    Then isEventHandler is true

  Scenario: Classify composition props
    Given prop named "asChild"
    When classifying
    Then isComposition is true

  Scenario: Multiple classifications
    Given prop "defaultOpen"
    When classifying
    Then isStateControl is true (default variant)
```

### TDD Cycles

1. **state control detection test**
   - Test: classify({ name: "open" }).isStateControl === true
   - Impl: Pattern match open, value, checked, pressed, defaultX
   - Refactor: Add more state prop patterns

2. **event handler detection test**
   - Test: classify({ name: "onValueChange" }).isEventHandler === true
   - Impl: Match on[A-Z] pattern
   - Refactor: Validate callback type

3. **config detection test**
   - Test: classify({ name: "modal" }).isConfiguration === true
   - Impl: Known config prop names
   - Refactor: Allow extending config list

4. **composition detection test**
   - Test: classify({ name: "asChild" }).isComposition === true
   - Impl: Match asChild, children
   - Refactor: Handle render props

### Files

- `src/extractor/classifier.ts` (create)

---

## Feature 5: Behavior Signature Generator

**Status:** GAP

### Description

Transform extracted primitive data into BehaviorSignature - the "spec" we compare components against.

### Gherkin

```gherkin
Feature: Generate behavior signatures

  Scenario: Infer state pattern
    Given extracted Dialog with open/onOpenChange
    When generating signature
    Then statePattern is "binary"

  Scenario: Infer composition pattern
    Given extracted Dialog with Root, Trigger, Content
    When generating signature
    Then compositionPattern is "compound"

  Scenario: Identify distinguishing props
    Given extracted Dialog with "modal" prop
    When generating signature
    Then distinguishingProps includes "modal"
    And "modal" is NOT in Popover's distinguishing props

  Scenario: Generate disambiguation rules
    Given Dialog and Popover both have open/onOpenChange
    When generating signatures
    Then Dialog.disambiguationRule mentions "modal" or "Overlay"
    And Popover.disambiguationRule mentions "positioning"
```

### TDD Cycles

1. **state pattern inference test**
   - Test: inferStatePattern with open → "binary"
   - Impl: Check prop patterns
   - Refactor: Handle edge cases (Slider → range)

2. **composition pattern inference test**
   - Test: inferComposition with 3+ subComponents → "compound"
   - Impl: Count and analyze sub-components
   - Refactor: Detect provider pattern

3. **rendering pattern inference test**
   - Test: inferRendering with Portal → "portal"
   - Impl: Check for Portal, Content, conditional patterns
   - Refactor: Handle portal-conditional combo

4. **distinguishing props test**
   - Test: getDistinguishing for Dialog includes "modal"
   - Impl: Compare against known signatures
   - Refactor: Auto-detect from cross-primitive analysis

5. **disambiguation test**
   - Test: generateDisambiguation("Dialog") returns rule
   - Impl: Encode disambiguation rules
   - Refactor: Make rules data-driven

### Files

- `src/signatures/inference.ts` (create)
- `src/signatures/distinguishing.ts` (create)
- `src/signatures/disambiguation.ts` (create)
- `src/signatures/generator.ts` (create)
- `src/signatures/index.ts` (create)

---

## Feature 6: Cache System

**Status:** GAP

### Description

Version-aware caching of extracted contracts and generated signatures.

### Gherkin

```gherkin
Feature: Cache extracted data

  Scenario: Cache hit
    Given Dialog 1.0.5 was extracted yesterday
    And TTL is 7 days
    When requesting Dialog 1.0.5
    Then returns cached data without fetching

  Scenario: Cache miss - version not cached
    Given Dialog 1.0.4 is cached
    When requesting Dialog 1.0.5
    Then fetches and caches 1.0.5

  Scenario: Cache invalidation by TTL
    Given Dialog 1.0.5 was extracted 8 days ago
    And TTL is 7 days
    When requesting Dialog 1.0.5
    Then refetches and updates cache

  Scenario: Force refresh
    Given Dialog 1.0.5 is cached
    When requesting with forceRefresh: true
    Then fetches fresh data
    And updates cache
```

### TDD Cycles

1. **cache read test**
   - Test: getFromCache("dialog", "1.0.5") returns data
   - Impl: Read from .limps-radix/{version}/
   - Refactor: Handle missing files

2. **cache write test**
   - Test: saveToCache writes JSON
   - Impl: Write to versioned directory
   - Refactor: Ensure directory exists

3. **TTL check test**
   - Test: isExpired returns true after TTL
   - Impl: Compare extractedAt to now
   - Refactor: Configurable TTL

4. **version resolution caching test**
   - Test: "latest" resolution cached separately
   - Impl: Store latest → semver mapping
   - Refactor: Shorter TTL for latest resolution

### Files

- `src/cache/storage.ts` (create)
- `src/cache/ttl.ts` (create)
- `src/cache/index.ts` (create)

---

## Feature 7: MCP Tool - radix_list_primitives

**Status:** GAP

### Description

List all available Radix primitives with basic metadata.

### Gherkin

```gherkin
Feature: radix_list_primitives tool

  Scenario: List primitives for latest
    When calling radix_list_primitives with {}
    Then returns list of 20+ primitives
    And each has name, package, description

  Scenario: List primitives for specific version
    When calling radix_list_primitives with { version: "1.0.0" }
    Then returns primitives available in that version
```

### TDD Cycles

1. **tool registration test**
   - Test: tools array includes radix_list_primitives
   - Impl: Add tool definition
   - Refactor: Extract schema

2. **handler test**
   - Test: handler returns primitive list
   - Impl: Call fetcher.listPrimitives
   - Refactor: Add caching

### Files

- `src/tools/list-primitives.ts` (create)

---

## Feature 8: MCP Tool - radix_extract_primitive

**Status:** GAP

### Description

Extract the full behavioral contract from a specific Radix primitive.

### Gherkin

```gherkin
Feature: radix_extract_primitive tool

  Scenario: Extract Dialog
    When calling radix_extract_primitive with { primitive: "dialog" }
    Then returns behavior patterns
    And returns sub-components with props
    And returns similar primitives

  Scenario: Invalid primitive
    When calling radix_extract_primitive with { primitive: "fake" }
    Then returns helpful error
```

### TDD Cycles

1. **tool schema test**
   - Test: Schema requires primitive, optional version
   - Impl: Define inputSchema
   - Refactor: Add descriptions

2. **handler success test**
   - Test: Returns ExtractPrimitiveOutput shape
   - Impl: Orchestrate fetch → extract → generate
   - Refactor: Use cache

3. **handler error test**
   - Test: Invalid primitive returns error
   - Impl: Catch and format errors
   - Refactor: Suggest similar primitives

### Files

- `src/tools/extract-primitive.ts` (create)

---

## Feature 9: Component Analyzer

**Status:** GAP

### Description

Analyze a local React component file to extract its behavioral contract for comparison against Radix signatures.

### Gherkin

```gherkin
Feature: Analyze local component

  Scenario: Analyze Dialog-like component
    Given CustomModal.tsx with open/onOpenChange props
    When analyzing
    Then inferredStatePattern is "binary"
    And propsInterface has open, onOpenChange
    And usesForwardRef is detected

  Scenario: Detect sub-components
    Given Modal.tsx with Modal.Root, Modal.Content pattern
    When analyzing
    Then subComponents includes "Root", "Content"

  Scenario: Detect Radix patterns
    Given component using asChild prop
    When analyzing
    Then hasAsChild is true
```

### TDD Cycles

1. **file parsing test**
   - Test: parseComponent loads .tsx
   - Impl: Use ts-morph Project
   - Refactor: Handle syntax errors

2. **props extraction test**
   - Test: Extract props interface from component
   - Impl: Find Props type, extract properties
   - Refactor: Handle inline props

3. **sub-component detection test**
   - Test: Detect Component.Sub pattern
   - Impl: Find property assignments
   - Refactor: Handle default exports

4. **pattern inference test**
   - Test: Infer state pattern from props
   - Impl: Reuse classifier logic
   - Refactor: Handle ambiguous cases

5. **feature detection test**
   - Test: Detect forwardRef, asChild
   - Impl: Check for patterns in AST
   - Refactor: Detect ARIA roles

### Files

- `src/analyzer/parser.ts` (create)
- `src/analyzer/props.ts` (create)
- `src/analyzer/patterns.ts` (create)
- `src/analyzer/index.ts` (create)

---

## Feature 10: Confidence Scorer

**Status:** GAP

### Description

Score how well a local component matches each Radix primitive signature.

### Gherkin

```gherkin
Feature: Score component against primitives

  Scenario: High confidence match
    Given component with open, onOpenChange, modal, Overlay
    When scoring against Dialog
    Then confidence >= 85
    And breakdown shows high state, composition scores

  Scenario: Low confidence - missing props
    Given component with just open, onOpenChange
    When scoring against Dialog
    Then confidence 50-70
    And signals.missing includes "modal"

  Scenario: Anti-pattern detection
    Given component with delayDuration (Tooltip prop)
    When scoring against Dialog
    Then confidence penalized
    And signals.antiPatterns includes "delayDuration"
```

### TDD Cycles

1. **state pattern scoring test**
   - Test: Binary state scores 35 for Dialog
   - Impl: Compare inferred vs expected pattern
   - Refactor: Partial credit for similar patterns

2. **composition scoring test**
   - Test: Compound composition scores 25
   - Impl: Compare sub-component structure
   - Refactor: Score partial matches

3. **props scoring test**
   - Test: Modal prop scores for Dialog
   - Impl: Check distinguishing props
   - Refactor: Penalize anti-patterns

4. **aggregate score test**
   - Test: Combined score 0-100
   - Impl: Sum weighted scores
   - Refactor: Return breakdown

### Files

- `src/analyzer/scorer.ts` (create)
- `src/analyzer/weights.ts` (create)

---

## Feature 11: Disambiguator

**Status:** GAP

### Description

When multiple primitives score similarly, apply disambiguation rules to pick the best match.

### Gherkin

```gherkin
Feature: Disambiguate similar primitives

  Scenario: Dialog vs Popover
    Given component scores Dialog: 70, Popover: 68
    And component has "modal" prop
    When disambiguating
    Then Dialog wins
    And reasoning mentions "modal prop indicates Dialog"

  Scenario: Tooltip vs HoverCard
    Given component scores Tooltip: 75, HoverCard: 73
    And component has "delayDuration" (not "openDelay")
    When disambiguating
    Then Tooltip wins
    And reasoning mentions "delayDuration naming"

  Scenario: Not ambiguous
    Given component scores Dialog: 90, Popover: 45
    When checking isAmbiguous
    Then returns false
```

### TDD Cycles

1. **ambiguity detection test**
   - Test: Top 2 within 10 points is ambiguous
   - Impl: Compare scores
   - Refactor: Configurable threshold

2. **Dialog vs Popover test**
   - Test: modal presence disambiguates
   - Impl: Check for modal, Overlay
   - Refactor: Position props for Popover

3. **Tooltip vs HoverCard test**
   - Test: delayDuration vs openDelay
   - Impl: Check prop naming
   - Refactor: Content complexity

4. **Checkbox vs Switch vs Toggle test**
   - Test: Sub-component structure disambiguates
   - Impl: Check for Thumb, Indicator, pressed
   - Refactor: Handle all three

### Files

- `src/analyzer/disambiguator.ts` (create)
- `src/analyzer/rules/index.ts` (create)
- `src/analyzer/rules/dialog-popover.ts` (create)
- `src/analyzer/rules/tooltip-hovercard.ts` (create)
- `src/analyzer/rules/checkbox-switch-toggle.ts` (create)

---

## Feature 12: MCP Tool - radix_analyze_component

**Status:** GAP

### Description

Analyze a local component and return Radix adoption recommendations.

### Gherkin

```gherkin
Feature: radix_analyze_component tool

  Scenario: Recommend Radix adoption
    Given CustomModal.tsx matches Dialog pattern well
    When calling radix_analyze_component
    Then recommendation.action is "ADOPT_RADIX"
    And recommendation.primitive is "Dialog"
    And confidence >= 70

  Scenario: Consider Radix
    Given component partially matches
    When analyzing
    Then recommendation.action is "CONSIDER_RADIX"
    And matches shows alternatives

  Scenario: Custom is OK
    Given component has no Radix match
    When analyzing
    Then recommendation.action is "CUSTOM_OK"
```

### TDD Cycles

1. **tool integration test**
   - Test: Tool calls analyzer pipeline
   - Impl: Wire up analyze → score → disambiguate
   - Refactor: Handle file not found

2. **recommendation logic test**
   - Test: 70+ → ADOPT, 50-69 → CONSIDER, <50 → CUSTOM_OK
   - Impl: Apply thresholds
   - Refactor: Configurable thresholds

3. **output format test**
   - Test: Returns AnalysisResult shape
   - Impl: Format all fields
   - Refactor: Include analysis details

### Files

- `src/tools/analyze-component.ts` (create)

---

## Feature 13: Contract Differ

**Status:** GAP

### Description

Diff two ExtractedPrimitive contracts to detect changes between versions.

### Gherkin

```gherkin
Feature: Diff primitive contracts

  Scenario: Detect removed prop
    Given Dialog 1.0 has "allowPinchZoom"
    And Dialog 1.1 doesn't have it
    When diffing
    Then changes includes prop_removed, breaking

  Scenario: Detect added prop
    Given Dialog 1.1 adds "onCloseAutoFocus"
    When diffing
    Then changes includes prop_added, info

  Scenario: Detect type narrowing (breaking)
    Given prop changed from "string | number" to "string"
    When diffing
    Then changes includes type_narrowed, breaking

  Scenario: Detect type widening (safe)
    Given prop changed from "string" to "string | number"
    When diffing
    Then changes includes type_widened, info
```

### TDD Cycles

1. **prop comparison test**
   - Test: Detect added/removed props
   - Impl: Set difference on prop names
   - Refactor: Handle renames

2. **required change test**
   - Test: optional → required is breaking
   - Impl: Compare required flags
   - Refactor: required → optional is info

3. **type change test**
   - Test: Narrowing detected as breaking
   - Impl: Parse and compare types
   - Refactor: Handle union types

4. **migration hint test**
   - Test: Generate helpful hints
   - Impl: Template-based hints
   - Refactor: Link to changelog

### Files

- `src/differ/props.ts` (create)
- `src/differ/types.ts` (create)
- `src/differ/severity.ts` (create)
- `src/differ/hints.ts` (create)
- `src/differ/index.ts` (create)

---

## Feature 14: MCP Tool - radix_diff_versions

**Status:** GAP

### Description

Compare two Radix versions to detect changes.

### Gherkin

```gherkin
Feature: radix_diff_versions tool

  Scenario: Diff all primitives
    When calling with { fromVersion: "1.0.0", toVersion: "1.1.0" }
    Then returns changes for all primitives
    And summary counts by severity

  Scenario: Diff specific primitives
    When calling with { primitives: ["dialog", "popover"] }
    Then only diffs those primitives

  Scenario: Breaking only filter
    When calling with { breakingOnly: true }
    Then only returns breaking changes
```

### TDD Cycles

1. **full diff test**
   - Test: Diffs all primitives between versions
   - Impl: Loop primitives, aggregate changes
   - Refactor: Parallel extraction

2. **filtered diff test**
   - Test: Only specified primitives diffed
   - Impl: Filter primitive list
   - Refactor: Validate primitive names

3. **breaking filter test**
   - Test: Only breaking changes returned
   - Impl: Filter by severity
   - Refactor: Keep summary accurate

### Files

- `src/tools/diff-versions.ts` (create)

---

## Feature 15: MCP Tool - radix_check_updates

**Status:** GAP

### Description

Check if a new Radix version is available and summarize changes.

### Gherkin

```gherkin
Feature: radix_check_updates tool

  Scenario: Update available
    Given cached version is 1.0.0
    And latest is 1.1.0
    When checking updates
    Then hasUpdate is true
    And diff is included

  Scenario: No update
    Given cached version is latest
    When checking updates
    Then hasUpdate is false

  Scenario: Refresh cache
    When calling with { refreshCache: true }
    Then cache is updated to latest
```

### TDD Cycles

1. **version comparison test**
   - Test: Detect when update available
   - Impl: Compare cached vs npm latest
   - Refactor: Handle first run

2. **auto-diff test**
   - Test: Diff included when update found
   - Impl: Call differ automatically
   - Refactor: Make diff optional

3. **cache refresh test**
   - Test: refreshCache updates signatures
   - Impl: Force re-extraction
   - Refactor: Return new version info

### Files

- `src/tools/check-updates.ts` (create)

---

## Feature 16: Provider Architecture

**Status:** GAP

### Description

Design pluggable provider system for future support of other component libraries.

### Gherkin

```gherkin
Feature: Component library providers

  Scenario: Register Radix provider
    Given RadixProvider implements ComponentLibraryProvider
    When registering
    Then providers.get("radix") returns it

  Scenario: Use different provider
    Given ArkProvider registered
    When calling radix_analyze_component with { provider: "ark" }
    Then uses Ark signatures for comparison

  Scenario: Default provider
    Given no provider specified
    When analyzing
    Then uses "radix" as default
```

### TDD Cycles

1. **provider interface test**
   - Test: RadixProvider implements interface
   - Impl: Define ComponentLibraryProvider
   - Refactor: Extract common logic

2. **registry test**
   - Test: Register and retrieve providers
   - Impl: Map-based registry
   - Refactor: Validate on register

3. **tool integration test**
   - Test: Tools accept provider param
   - Impl: Add to tool schemas
   - Refactor: Validate provider exists

### Files

- `src/providers/interface.ts` (create)
- `src/providers/registry.ts` (create)
- `src/providers/radix.ts` (create)
- `src/providers/index.ts` (create)

---

## Feature 17: CLI Commands

**Status:** GAP

### Description

Standalone CLI for use outside of MCP context.

### Gherkin

```gherkin
Feature: CLI commands

  Scenario: Extract via CLI
    When running limps-radix extract dialog
    Then prints primitive contract

  Scenario: Analyze via CLI
    When running limps-radix analyze ./src/Modal.tsx
    Then prints recommendation

  Scenario: JSON output
    When running limps-radix list --json
    Then outputs valid JSON
```

### TDD Cycles

1. **CLI framework test**
   - Test: Commander parses commands
   - Impl: Set up commander
   - Refactor: Add help text

2. **command handlers test**
   - Test: Each command calls tool handler
   - Impl: Wire commands to handlers
   - Refactor: Shared error handling

3. **JSON output test**
   - Test: --json flag outputs JSON
   - Impl: Format output based on flag
   - Refactor: Pretty vs compact

### Files

- `src/cli/index.ts` (create)
- `src/cli/commands/extract.ts` (create)
- `src/cli/commands/analyze.ts` (create)
- `src/cli/commands/diff.ts` (create)
- `src/cli/commands/list.ts` (create)
- `bin/limps-radix` (create)

---

## Feature 18: Documentation & Examples

**Status:** GAP

### Description

Comprehensive documentation for users and contributors.

### Gherkin

```gherkin
Feature: Documentation

  Scenario: README quick start
    Given developer wants to try limps-radix
    When reading README
    Then installation steps are clear
    And first tool call example works

  Scenario: Tool documentation
    Given developer wants to understand a tool
    When reading tool docs
    Then input/output schemas documented
    And examples provided

  Scenario: Provider guide
    Given developer wants to add shadcn support
    When reading provider guide
    Then interface is documented
    And example provider shown
```

### Files

- `README.md` (create)
- `docs/tools.md` (create)
- `docs/architecture.md` (create)
- `docs/providers.md` (create)
- `examples/audit-workflow.md` (create)

---

## Feature 19: Unified Package Support (GTC-004)

**Status:** GAP

### Description

Extend fetcher to support unified `radix-ui` package (v1.4.3+). Modern projects use the unified package instead of individual `@radix-ui/react-*` packages.

### Gherkin

```gherkin
Feature: Unified radix-ui package support

  Scenario: Detect unified package
    Given radix-ui@1.4.3+ is available on npm
    When detecting package source
    Then returns "unified"

  Scenario: Fetch from unified package
    Given unified package is available
    When fetching dialog types
    Then fetches from radix-ui/dist/dialog.d.ts

  Scenario: Fallback to individual packages
    Given unified package fetch fails
    When fetching dialog types
    Then falls back to @radix-ui/react-dialog
```

### TDD Cycles

1. **Detect unified package test**
   - Test: detectPackageSource returns "unified" when radix-ui >= 1.4.3
   - Impl: Query npm registry for radix-ui version
   - Refactor: Cache detection result

2. **Map primitive to unified path test**
   - Test: resolvePackage maps dialog to correct unified path
   - Impl: Map primitive names to unified exports
   - Refactor: Handle naming differences

3. **Fetch from unified test**
   - Test: fetchTypes uses unified package when available
   - Impl: Construct correct unpkg URL
   - Refactor: Handle 404 gracefully

4. **Fallback test**
   - Test: Falls back to individual on unified failure
   - Impl: Try unified first, then individual
   - Refactor: Log which source was used

5. **Cache detection test**
   - Test: Detection is cached
   - Impl: Module-level cache with 1h TTL
   - Refactor: Only query npm once

### Files

- `src/fetcher/unified-package.ts` (create)
- `src/fetcher/npm-registry.ts` (modify)
- `src/fetcher/unpkg.ts` (modify)
- `tests/fetcher-unified.test.ts` (create)

---

## Feature 20: Complex Type Parsing (GTC-005)

**Status:** GAP

### Description

Improve extractor to handle real npm .d.ts patterns including ForwardRefExoticComponent, type aliases, and intersection types.

### Gherkin

```gherkin
Feature: Complex .d.ts parsing

  Scenario: Extract from ForwardRefExoticComponent
    Given type uses ForwardRefExoticComponent pattern
    When extracting props
    Then extracts props from type parameter

  Scenario: Resolve type aliases
    Given props are defined via type alias
    When extracting
    Then resolves alias to underlying interface

  Scenario: Handle intersection types
    Given props are intersection of multiple types
    When extracting
    Then merges all type members

  Scenario: Detect sub-components
    Given primitive has multiple exports (DialogRoot, DialogTrigger, etc)
    When extracting
    Then subComponents array is populated
```

### TDD Cycles

1. **Find ForwardRef declarations test**
   - Test: Finds ForwardRefExoticComponent type declarations
   - Impl: Find variable declarations with ForwardRef type
   - Refactor: Handle export patterns

2. **Extract props from ForwardRef test**
   - Test: Extracts props from type parameter
   - Impl: Parse type argument, find props interface
   - Refactor: Handle intersection in type argument

3. **Resolve type aliases test**
   - Test: Resolves alias to interface
   - Impl: Follow type alias chain
   - Refactor: Handle re-exports

4. **Merge intersection types test**
   - Test: Merges all members from intersection
   - Impl: Recursively resolve each part
   - Refactor: Filter React internals (ref, key)

5. **Detect sub-components test**
   - Test: Detects sub-components from exports
   - Impl: Find exports matching primitive name pattern
   - Refactor: Handle various export syntaxes

### Files

- `src/extractor/type-resolver.ts` (create)
- `src/extractor/forward-ref.ts` (create)
- `src/extractor/interface.ts` (modify)
- `src/extractor/props.ts` (modify)
- `tests/extractor-complex.test.ts` (create)

---

## Status

Status: Planning
