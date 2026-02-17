---
tags: [gotchas]
---

# Gotchas

## Format

```
### [Title]
**Discovered**: [date]
**Severity**: low | medium | high
**Description**: ...
**Resolution**: ...
```

## Known Upfront

### SQLite single-process safety
**Severity**: low
**Description**: `better-sqlite3` is synchronous. Multiple HTTP sessions access the same DB from a single Node.js process.
**Resolution**: Safe — Node.js event loop serializes all synchronous calls. No locking issues.

### McpServer 1:1 with transport
**Severity**: medium
**Description**: MCP SDK requires one `McpServer` instance per `StreamableHTTPServerTransport`. Cannot share a single McpServer across sessions.
**Resolution**: Create a new McpServer per session via `createServer(config, db, extensions)`. This is cheap — just tool/resource registration. Shared resources (DB, watcher, extensions) are allocated once.

### Express 5 as transitive dependency
**Severity**: low
**Description**: `express@5` is pulled in by `@modelcontextprotocol/sdk` but not declared as a direct dependency.
**Resolution**: Add `express` as a direct dependency in `package.json` for stability.

---

*Add new gotchas below as they are discovered during implementation.*
