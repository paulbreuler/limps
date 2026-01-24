# Release Process

This document explains how to create releases with pre-built binaries.

## Creating a Release

### Automatic Release (Recommended)

1. **Update version in package.json:**
   ```json
   {
     "version": "0.2.1"
   }
   ```

2. **Create and push a git tag:**
   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

3. **GitHub Actions will automatically:**
   - Build the server on Linux, macOS, and Windows
   - Run tests
   - Create release archives
   - Create a GitHub release with all artifacts

### Manual Release

1. Go to Actions → Release workflow
2. Click "Run workflow"
3. Enter the version tag (e.g., `v0.2.1`)
4. The workflow will build and create a release

## Release Contents

Each release archive includes:

- `dist/` - Pre-built JavaScript files (no build step needed)
- `package.json` - Package metadata
- `config.json.example` - Configuration template
- `README.md` - Documentation
- `INSTALLATION.md` - Installation guide
- `SETUP_CURSOR.md` - Cursor setup guide

## What Users Get

Users who download a release can:

1. Extract the archive
2. Edit `config.json.example` → `config.json`
3. Configure paths to their documents
4. Run `node dist/index.js` immediately

**No `npm install` or `npm run build` required!**

## Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backward compatible
- **PATCH** (0.0.1): Bug fixes, backward compatible

Pre-release versions (e.g., `v0.2.1-beta.1`) are marked as pre-releases on GitHub.
