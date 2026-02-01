# Interfaces

## Config Additions

```ts
export interface ToolFilteringConfig {
  allowlist?: string[]; // Explicit tools to expose
  denylist?: string[];  // Tools to hide
}

export interface ServerConfig {
  // existing fields...
  tools?: ToolFilteringConfig;
}
```

### Env Vars

```ts
// Comma-separated tool names
process.env.LIMPS_ALLOWED_TOOLS
process.env.LIMPS_DISABLED_TOOLS
```

### Precedence
1. `config.tools.allowlist` / `config.tools.denylist`
2. `LIMPS_ALLOWED_TOOLS` / `LIMPS_DISABLED_TOOLS`
3. default: no filtering

## Tool Registration Filter

```ts
export function filterToolDefinitions(
  tools: ToolDefinition[],
  config: ToolFilteringConfig | undefined,
  env: NodeJS.ProcessEnv
): ToolDefinition[];
```

### Expected Behavior
- If allowlist present: only those tool names are registered.
- Else if denylist present: all except those are registered.
- Unknown tool names are ignored with a warning.
- Filtering must not change tool schemas or IDs.

## README Sections

- **Features**: list of available tools + short descriptions
- **CLI Options**: top-level options + key subcommands
- **Environment Variables**: table including `LIMPS_PROJECT`, `LIMPS_ALLOWED_TOOLS`, `LIMPS_DISABLED_TOOLS`
- **Skills**: install + usage of limps planning skill
- **Transport**: stdio + roadmap for SSE/HTTP
