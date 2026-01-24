# Installation Guide

This guide explains how to install and configure the MCP Planning Server to work with your planning documents stored anywhere on your local machine.

## Prerequisites

- **Node.js** v20 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Cursor** or another MCP-compatible client (optional, for AI integration)

## Installation Steps

### Option A: Use Pre-built Release (Recommended)

1. **Download the latest release:**
   - Go to the [Releases](https://github.com/yourusername/mcp-planning-server/releases) page
   - Download the archive for your platform:
     - `mcp-planning-server-vX.X.X-linux-x64.tar.gz` for Linux
     - `mcp-planning-server-vX.X.X-macos-x64.tar.gz` for macOS
     - `mcp-planning-server-vX.X.X-windows-x64.zip` for Windows

2. **Extract the archive:**
   ```bash
   # Linux/macOS
   tar -xzf mcp-planning-server-vX.X.X-linux-x64.tar.gz
   cd mcp-planning-server-vX.X.X-linux-x64
   
   # Windows
   # Extract the ZIP file and navigate to the extracted folder
   ```

3. **Configure paths** (see Step 4 below)

**No build step required!** The release includes pre-built files.

### Option B: Build from Source

1. **Clone or Download the Repository**

```bash
# Option A: Clone the repository
git clone https://github.com/yourusername/mcp-planning-server.git
cd mcp-planning-server

# Option B: Download and extract the ZIP file
# Then navigate to the extracted directory
cd mcp-planning-server
```

2. **Install Dependencies**

```bash
npm install
```

3. **Build the Server**

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 4. Configure Paths (Both Options)

The server uses `config.json` to know where your planning documents are stored. You can point it to **any directory** on your system.

#### Option A: Edit the Default Config

Edit `config.json` in the repository root:

```json
{
  "plansPath": "/absolute/path/to/your/planning/documents",
  "docsPaths": ["/absolute/path/to/your/planning/documents"],
  "fileExtensions": [".md"],
  "dataPath": "./data",
  "coordinationPath": "./data/coordination.json",
  "heartbeatTimeout": 300000,
  "debounceDelay": 200,
  "maxHandoffIterations": 3
}
```

**Key Configuration Options:**

- **`plansPath`**: Primary directory containing your planning documents (e.g., `"/Users/john/Documents/my-plans"` or `"C:\\Users\\john\\Documents\\my-plans"` on Windows)
- **`docsPaths`**: Additional directories to index (array of paths)
- **`fileExtensions`**: File types to index (default: `[".md"]`)
- **`dataPath`**: Where to store the SQLite database (relative to config file or absolute path)
- **`coordinationPath`**: Where to store agent coordination state (relative to config file or absolute path)

#### Option B: Use Absolute Paths for Everything

For maximum flexibility, use absolute paths:

```json
{
  "plansPath": "/Users/john/Documents/my-project/plans",
  "docsPaths": [
    "/Users/john/Documents/my-project/plans",
    "/Users/john/Documents/my-project/docs"
  ],
  "fileExtensions": [".md", ".txt"],
  "dataPath": "/Users/john/.mcp-planning-server/data",
  "coordinationPath": "/Users/john/.mcp-planning-server/coordination.json",
  "heartbeatTimeout": 300000,
  "debounceDelay": 200,
  "maxHandoffIterations": 3
}
```

#### Option C: Use Relative Paths (if config is near your docs)

If your planning documents are in a sibling directory:

```json
{
  "plansPath": "../my-planning-docs",
  "docsPaths": ["../my-planning-docs"],
  "fileExtensions": [".md"],
  "dataPath": "./data",
  "coordinationPath": "./data/coordination.json",
  "heartbeatTimeout": 300000,
  "debounceDelay": 200,
  "maxHandoffIterations": 3
}
```

**Note:** Relative paths are resolved relative to the `config.json` file location.

### 5. Test the Server (Both Options)

Verify the server starts correctly:

```bash
node dist/index.js
```

You should see output like:
```
Database initialized at /path/to/data/documents.sqlite
Coordination state loaded from /path/to/coordination.json
Indexed X documents (Y updated, Z skipped)
File watcher started for N path(s)
MCP Planning Server running on stdio
```

Press `Ctrl+C` to stop the server.

### 6. Configure Cursor (Optional)

If you're using Cursor, add the MCP server configuration:

1. Open Cursor Settings JSON:
   - Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Preferences: Open User Settings (JSON)"

2. Add the MCP server configuration:

```json
{
  "mcp.servers": {
    "mcp-planning-server": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-planning-server/dist/index.js"
      ],
      "cwd": "/absolute/path/to/mcp-planning-server"
    }
  }
}
```

**Important:** Replace `/absolute/path/to/mcp-planning-server` with the actual path where you installed the server.

3. Restart Cursor

4. Verify it's working:
   - The server should appear in Cursor's MCP panel
   - Try using MCP tools in Cursor's chat (e.g., `read_doc`, `list_docs`)

## Common Use Cases

### Use Case 1: Planning Documents in a Git Repository

```json
{
  "plansPath": "/Users/john/projects/my-project/plans",
  "docsPaths": ["/Users/john/projects/my-project"],
  "fileExtensions": [".md"],
  "dataPath": "/Users/john/.mcp-planning-server/data",
  "coordinationPath": "/Users/john/.mcp-planning-server/coordination.json"
}
```

### Use Case 2: Planning Documents in Dropbox/iCloud

```json
{
  "plansPath": "/Users/john/Dropbox/Planning",
  "docsPaths": ["/Users/john/Dropbox/Planning"],
  "fileExtensions": [".md", ".txt"],
  "dataPath": "/Users/john/.mcp-planning-server/data",
  "coordinationPath": "/Users/john/.mcp-planning-server/coordination.json"
}
```

### Use Case 3: Multiple Document Directories

```json
{
  "plansPath": "/Users/john/Documents/plans",
  "docsPaths": [
    "/Users/john/Documents/plans",
    "/Users/john/Documents/research",
    "/Users/john/Documents/notes"
  ],
  "fileExtensions": [".md", ".txt", ".rst"],
  "dataPath": "/Users/john/.mcp-planning-server/data",
  "coordinationPath": "/Users/john/.mcp-planning-server/coordination.json"
}
```

### Use Case 4: Windows Paths

```json
{
  "plansPath": "C:\\Users\\John\\Documents\\MyPlans",
  "docsPaths": ["C:\\Users\\John\\Documents\\MyPlans"],
  "fileExtensions": [".md"],
  "dataPath": "C:\\Users\\John\\.mcp-planning-server\\data",
  "coordinationPath": "C:\\Users\\John\\.mcp-planning-server\\coordination.json"
}
```

**Note:** On Windows, use double backslashes (`\\`) or forward slashes (`/`) in JSON paths.

## Directory Structure

The server doesn't require a specific directory structure. It will:

- **Index all files** matching the configured extensions in the specified paths
- **Watch for changes** and automatically update the index
- **Support any markdown structure** you use

However, if you want to use planning-specific features (like `create_plan`), you may want to organize documents like:

```
your-planning-docs/
├── plans/
│   ├── 0001-feature-name/
│   │   ├── plan.md
│   │   ├── README.md
│   │   └── agents/
│   └── 0002-another-feature/
└── addendums/
    └── 001-some-addendum.md
```

But this is **optional** - the server works with any structure.

## Troubleshooting

### Server Won't Start

1. **Check Node.js version:**
   ```bash
   node --version  # Should be v20+
   ```

2. **Verify build completed:**
   ```bash
   ls -la dist/index.js  # Should exist
   ```

3. **Check config.json syntax:**
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('config.json', 'utf-8'))"
   ```

### Documents Not Indexing

1. **Verify paths are correct:**
   - Use absolute paths to avoid confusion
   - Check that directories exist
   - Ensure you have read permissions

2. **Check file extensions:**
   - Files must match extensions in `fileExtensions` array
   - Default is `[".md"]` only

3. **Check server logs:**
   - Look for error messages in stderr
   - Verify indexing counts match expectations

### Permission Errors

- Ensure Node.js has read/write permissions to:
  - Your planning document directories
  - The `dataPath` directory (for database)
  - The `coordinationPath` file location

### Path Issues on Windows

- Use forward slashes (`/`) or escaped backslashes (`\\`) in JSON
- Avoid spaces in paths if possible, or ensure proper escaping
- Use absolute paths to avoid working directory issues

## Next Steps

- See [SETUP_CURSOR.md](./SETUP_CURSOR.md) for detailed Cursor configuration
- See [README.md](./README.md) for feature documentation
- Run `npm test` to verify everything works
- Check `config.json.example` for a template configuration
