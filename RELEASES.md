# Release Process

This document explains how to create releases with pre-built binaries and automatically generated changelogs.

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
   - Validate code (lint, test, build)
   - Build the server on Linux, macOS, and Windows
   - Run tests on all platforms
   - Generate release notes from commits and PRs
   - Create release archives
   - Create a GitHub release with all artifacts and changelog

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

## Automatic Release Notes

Releases automatically include changelogs generated from commits and pull requests using GitHub's official release notes API.

### What's Included

The automatically generated release notes include:

- **List of merged pull requests** since the previous release
- **Contributors** to the release
- **Organized by category** (Features, Bug Fixes, Documentation, etc.)
- **Link to full changelog** for detailed changes

### Customization

Release notes can be customized via `.github/release.yml` configuration file. The configuration allows you to:

- **Organize by categories** - Group PRs by labels (e.g., `enhancement`, `bug`, `documentation`)
- **Exclude items** - Hide certain labels or authors from release notes
- **Custom titles** - Set custom category titles with emojis

**Example configuration:**
```yaml
changelog:
  categories:
    - title: "🚀 Features"
      labels:
        - enhancement
        - feature
    - title: "🐛 Bug Fixes"
      labels:
        - bug
        - fix
    - title: "📚 Documentation"
      labels:
        - documentation
        - docs
```

### How It Works

1. When a tag is pushed, the workflow:
   - Finds the previous tag (if any)
   - Calls GitHub's `generateReleaseNotes` API endpoint
   - Uses `.github/release.yml` for categorization
   - Combines generated notes with installation instructions
   - Creates the release with the complete changelog

2. **First Release**: If no previous tag exists, the API generates notes from all commits since repository creation.

3. **Fallback**: If API generation fails, a basic release template is used.

### Commit Message Format

For best results, use [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Refactoring
- `chore:` - Maintenance

Pull requests should be labeled appropriately to appear in the correct category.

### Manual Override

If you need to manually edit release notes:

1. Create the release as a draft first
2. Edit the release notes in GitHub's UI
3. Publish when ready

**Note:** The workflow will still generate notes, but you can edit them before publishing.
