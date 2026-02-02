---
title: npm Postinstall Hook
status: GAP
persona: coder
depends_on: [002]
files:
  - scripts/install-skills.ts
  - package.json
tags: [skills, npm, postinstall]
---

# Agent 003: npm Postinstall Hook

## Objective

Auto-install skills when `@sudosandwich/limps` is installed via npm.

## Tasks

1. **Create install script** (`scripts/install-skills.ts`)
   - Detect global vs local installation
   - Read config from package.json `limps.skills`
   - Call exporter for configured targets
   - Handle errors gracefully (don't fail install)

2. **Update package.json**
   - Add `postinstall` script
   - Add `limps.skills` configuration section
   - Document in README

3. **Configuration schema**
   ```json
   {
     "limps": {
       "skills": {
         "autoInstall": true,
         "targets": ["claude"],
         "skills": ["limps-planning"]
       }
     }
   }
   ```

## Acceptance Criteria

- [ ] `npm install @sudosandwich/limps` auto-installs skills
- [ ] `npm install -g @sudosandwich/limps` installs to global dirs
- [ ] `--ignore-scripts` skips auto-install
- [ ] Config can disable auto-install
- [ ] Errors are logged but don't fail installation

## Edge Cases

- No write permission to target directory
- Skill already exists (skip unless forced)
- Target directory doesn't exist (create it)
- Invalid config (use defaults)
