# Obsidian Deep Integration Architecture

This document describes the architecture of the limps Obsidian plugin's deep integration layer: persistent MCP sessions, scheduled health checks, vault event automation, and the dual-mode execution model.

## MCP Session Lifecycle

The plugin uses `McpClientManager` to maintain a persistent MCP session to the limps HTTP daemon.

### Connection Flow

1. On plugin load, if `enablePersistentMcp` is `true`, the manager connects to the configured `mcpEndpoint` (default `http://127.0.0.1:4269/mcp`).
2. The manager sends a JSON-RPC `initialize` request with client info and protocol version.
3. On success, it stores the `mcp-session-id` header for subsequent requests.
4. A keepalive timer starts (default: every 14 minutes) sending periodic pings.

### Reconnection

When a request fails or the session is lost:

1. The manager emits a `disconnected` event with a reason string.
2. It enters reconnection mode, emitting `reconnecting` events with attempt counts.
3. Reconnection uses exponential backoff up to `mcpReconnectMaxAttempts` (default: 10).
4. On successful reconnect, a `connected` event is emitted with the new session ID.
5. If all attempts are exhausted, the manager stays disconnected and operations fall back to CLI.

### CLI Fallback

`LimpsToolWrapper` abstracts tool calls behind a unified interface:

- When MCP is connected, tool calls go through JSON-RPC (`tools/call`).
- When MCP is unavailable, the wrapper falls back to CLI execution via `execCommand()`.
- The wrapper exposes methods like `getProposals()`, `applyProposal()`, `searchDocs()`, `createDoc()`, `getNextTask()`, and `updateTaskStatus()`.

### Shutdown

On plugin unload:

1. The keepalive timer is cleared.
2. The MCP session is terminated (no explicit close request; the session times out server-side).
3. All event listeners are removed.

## Scheduled Health Checks

`WorkflowScheduler` runs periodic health checks against the limps daemon.

### Check Types

Each health check run performs:

1. **Daemon status** — verifies the daemon is running and reachable.
2. **Graph health** — queries graph health for entity/relation counts, conflicts, errors, and warnings.
3. Results are classified as `staleness`, `drift`, or `conflict` checks with issue counts.

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `enableScheduledHealthChecks` | `false` | Enable periodic checks |
| `healthCheckIntervalMs` | `14400000` (4 hours) | Interval between checks |

### Integration with Notifications

When issues are found and `notifyOnIssuesFound` is enabled, the `NotificationManager` shows Obsidian notices with severity-based timeouts:

| Severity | Timeout |
|----------|---------|
| `info` | 3 seconds |
| `success` | 4 seconds |
| `warning` | 7 seconds |
| `error` | 10 seconds |

The notification log retains up to 200 entries.

## Vault Event Automation

`VaultEventHandler` watches for vault changes and triggers automated responses.

### Event Filtering

The handler listens to Obsidian vault events (`modify`, `delete`, `rename`) and filters them:

1. Only `.md` files are considered.
2. Only files within the configured plans directory trigger actions.
3. The plans directory is computed as a relative prefix from the vault path (e.g., if vault is at `/vault` and plans are at `/vault/plans/`, the prefix is `plans/`).

### Auto-Reindex

When `autoReindexOnChange` is enabled, matching vault events trigger a debounced graph reindex via the CLI wrapper. The debounce interval is controlled by `eventRefreshDebounceMs` (default: 750ms).

### Auto-Proposals

When `autoApplyProposals` is enabled, the `runAutoProposals()` function:

1. Fetches current proposals via `LimpsToolWrapper.getProposals()`.
2. Filters to proposals whose `type` is in the `autoApplyProposalTypes` whitelist.
3. Applies each eligible proposal via `LimpsToolWrapper.applyProposal()`.
4. Reports results through `NotificationManager`.

Default whitelisted types: `frontmatter_cleanup`, `staleness_update`, `link_normalization`.

## File Watcher Behavior

The Obsidian plugin's vault event handler only watches files that pass the plans directory filter. This means:

- Files outside the plans directory (e.g., `.obsidian/`, other vault content) do not trigger reindex.
- Only markdown files trigger reindex — binary files, images, and other assets are ignored.
- The debounce ensures rapid successive saves produce a single reindex operation.

## Architecture Diagram

```
Obsidian Plugin (main.ts)
  |
  |-- McpClientManager (persistent MCP session)
  |     |-- JSON-RPC over HTTP to daemon
  |     |-- Keepalive timer
  |     |-- Reconnect with backoff
  |     +-- Event emitter (connected/disconnected/reconnecting/error)
  |
  |-- LimpsToolWrapper (dual-mode execution)
  |     |-- MCP path: callTool() -> JSON-RPC
  |     +-- CLI path: execCommand() -> child_process
  |
  |-- WorkflowScheduler (periodic health checks)
  |     |-- getDaemonStatus()
  |     +-- getGraphHealth()
  |
  |-- VaultEventHandler (vault automation)
  |     |-- Event filtering (plans dir + .md only)
  |     +-- Debounced reindex trigger
  |
  |-- NotificationManager (user notifications)
  |     |-- Severity-based Obsidian notices
  |     +-- In-memory log (max 200 entries)
  |
  +-- Auto-proposals (runAutoProposals)
        |-- Fetch proposals
        |-- Filter by whitelist
        +-- Apply eligible proposals
```
