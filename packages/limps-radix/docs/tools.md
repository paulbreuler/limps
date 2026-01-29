---
title: limps-radix Tool Reference
---

# Tool Reference

All tools accept an optional `provider` (default: `radix`). Provider support is pluggable but only `radix` is fully supported today.

## radix_list_primitives

List available primitives.

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
    { "name": "dialog", "package": "@radix-ui/react-dialog" }
  ]
}
```

## radix_extract_primitive

Extract a full primitive contract.

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
  "subComponents": [],
  "similarTo": []
}
```

## radix_analyze_component

Analyze a local component and recommend a Radix primitive. **filePath** is resolved relative to the current working directory (MCP server cwd or, when using the CLI, the directory you run `limps-radix` from—so run from your project root).

**Input**
```json
{
  "filePath": "src/components/MyDialog.tsx",
  "radixVersion": "latest",
  "threshold": 40,
  "provider": "radix"
}
```

**Output**
```json
{
  "component": "MyDialog",
  "filePath": "src/components/MyDialog.tsx",
  "recommendation": {
    "primitive": "Dialog",
    "package": "@radix-ui/react-dialog",
    "confidence": 78,
    "action": "ADOPT_RADIX",
    "reason": "High confidence match (78) - strongly recommend adopting Dialog"
  },
  "isAmbiguous": false
}
```

## radix_diff_versions

Compare two versions for breaking changes.

**Input**
```json
{
  "fromVersion": "1.0.0",
  "toVersion": "latest",
  "primitives": ["dialog"],
  "breakingOnly": false,
  "provider": "radix"
}
```

**Output**
```json
{
  "fromVersion": "1.0.0",
  "toVersion": "1.1.2",
  "hasBreakingChanges": true,
  "summary": { "totalChanges": 1, "breaking": 1, "warnings": 0, "info": 0 },
  "changes": [
    {
      "primitive": "Dialog",
      "type": "prop_removed",
      "severity": "breaking",
      "target": "allowPinchZoom"
    }
  ]
}
```

## radix_check_updates

Check for a newer version and include diffs when available.

**Input**
```json
{
  "refreshCache": false,
  "provider": "radix"
}
```

**Output**
```json
{
  "currentVersion": "1.0.0",
  "latestVersion": "1.1.2",
  "hasUpdate": true,
  "diff": { "summary": { "totalChanges": 2, "breaking": 0, "warnings": 1, "info": 1 } }
}
```
