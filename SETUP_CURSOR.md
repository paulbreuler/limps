# Setting Up MCP Server in Cursor

This guide explains how to configure Cursor to use the MCP Planning Server.

## Prerequisites

1. **Node.js installed** (v20+)
2. **Dependencies installed**:
   ```bash
   cd /path/to/mcp-planning-server
   npm install
   ```

3. **Server built**:
   ```bash
   npm run build
   ```

## Configuration Steps

### Option 1: Cursor Settings UI (Recommended)

1. Open Cursor Settings:
   - Press `Cmd+,` (macOS) or `Ctrl+,` (Windows/Linux)
   - Or go to `Cursor > Settings` (macOS) / `File > Preferences > Settings` (Windows/Linux)

2. Search for "MCP" or "Model Context Protocol"

3. Add the server configuration:
   - Look for "MCP Servers" or "MCP Configuration"
   - Add a new server entry

### Option 2: Cursor Settings JSON

1. Open Cursor Settings JSON:
   - Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Preferences: Open User Settings (JSON)"
   - Select it

2. Add the MCP server configuration:

```json
{
  "mcp.servers": {
    "mcp-planning-server": {
      "command": "node",
      "args": [
        "/path/to/mcp-planning-server/dist/index.js"
      ],
      "cwd": "/path/to/mcp-planning-server"
    }
  }
}
```

**Important**: Update the paths to match your system:
- Replace `/path/to/mcp-planning-server` with the actual path to this repository
- The compiled JavaScript is in `dist/index.js` (after running `npm run build`)
- The `cwd` should point to the repository root directory

### Option 3: Using tsx/ts-node (Development)

If you want to run TypeScript directly without building:

```json
{
  "mcp.servers": {
    "mcp-planning-server": {
      "command": "npx",
      "args": [
        "tsx",
        "/path/to/mcp-planning-server/src/index.ts"
      ],
      "cwd": "/path/to/mcp-planning-server"
    }
  }
}
```

**Note**: This requires `tsx` to be installed globally or available via npx.

## Verify Installation

1. **Restart Cursor** after adding the configuration

2. **Check MCP Server Status**:
   - Open Cursor's MCP panel (if available)
   - Look for "mcp-planning-server" in the list
   - It should show as "connected" or "running"

3. **Test the Server**:
   - Try using MCP tools in Cursor's chat
   - Available tools include:
     - `read_doc` - Read document content
     - `list_docs` - List documents
     - `create_doc` - Create new documents
     - `update_doc` - Update documents
     - `delete_doc` - Delete documents
     - `search_docs` - Search documents
     - `create_plan` - Create feature plans
     - `claim_task` - Claim agent tasks
     - And more...

## Troubleshooting

### Server Not Starting

1. **Check Node.js version**:
   ```bash
   node --version  # Should be v20+
   ```

2. **Verify server is built**:
   ```bash
   cd /path/to/mcp-planning-server
   npm run build
   ls -la dist/index.js  # Should exist
   ```

3. **Test server manually**:
   ```bash
   cd /path/to/mcp-planning-server
   node dist/index.js
   ```
   You should see: `MCP Planning Server running on stdio`

4. **Check Cursor logs**:
   - Open Cursor's Developer Tools
   - Look for MCP-related errors

### Path Issues

- Use **absolute paths** in the configuration
- Ensure the `cwd` points to the repository root directory
- Verify the `index.js` file exists at the specified path

### Permission Issues

- Ensure Node.js has read/write permissions to:
  - Repository root directory
  - `data/` directory (for database)
  - Document paths specified in `config.json`

## Configuration File

The server reads configuration from `config.json` at the repository root:

```json
{
  "plansPath": "./plans",
  "docsPaths": ["."],
  "fileExtensions": [".md"],
  "dataPath": "./data",
  "coordinationPath": "./data/coordination.json",
  "heartbeatTimeout": 300000,
  "debounceDelay": 200,
  "maxHandoffIterations": 3
}
```

## Next Steps

1. **Index documents**: The server automatically indexes on startup
2. **Use tools**: Start using MCP tools in Cursor's chat
3. **Monitor logs**: Check stderr for server status messages

## Additional Resources

- [MCP Specification](https://modelcontextprotocol.io/)
- [Cursor MCP Documentation](https://docs.cursor.com/mcp)
- Server README: `README.md`
