# Branch code review: changes since last release

**Base:** previous release tag → `HEAD`

**Commits:** headless UI audit package (#50); differ module and version comparison (#49); component analyzer (#47)

---

## Findings

### Critical

- None.

### High

- **Path resolution in `generate-report`**: [packages/limps-headless/src/audit/generate-report.ts](packages/limps-headless/src/audit/generate-report.ts) uses `path.resolve(input.inputs.analysis)` (and similarly for diff, checkUpdates, inventory) without restricting to a project root. When the MCP tool is called with user/LLM-supplied paths, a path like `../../etc/passwd` could be resolved outside the project. **Recommendation:** Resolve paths relative to `process.cwd()` and reject paths that escape (e.g. `path.relative(cwd, resolved).startsWith('..')`), or document that callers must pass paths relative to cwd and that the server runs with a fixed cwd.

### Medium

- **File length**: [packages/limps-headless/src/audit/discover-components.ts](packages/limps-headless/src/audit/discover-components.ts) is ~581 lines and [packages/limps-headless/src/audit/generate-report.ts](packages/limps-headless/src/audit/generate-report.ts) is ~443 lines, both above the ~500-line guideline. Consider splitting discovery (e.g. walkFiles + metadata extraction) and report generation (e.g. issue building vs. markdown/JSON writing) into smaller modules for maintainability.
- **Default discovery root**: [packages/limps-headless/src/audit/discover-components.ts](packages/limps-headless/src/audit/discover-components.ts) defaults `rootDir` to `'src/components'`. Projects that keep components elsewhere (e.g. `components/`, `app/`) will get no discovery unless they pass `discovery.rootDir`. The README and tool descriptions mention running from the project directory; documenting the default and how to override it would reduce confusion.

### Low

- **Provider registry**: [packages/limps-headless/src/providers/registry.ts](packages/limps-headless/src/providers/registry.ts) throws when an unknown provider is requested (`getProvider`). Tool handlers catch this and return user-facing errors; behavior is consistent.
- **run-audit path handling**: [packages/limps-headless/src/audit/run-audit.ts](packages/limps-headless/src/audit/run-audit.ts) skips files outside cwd in `analyzeFiles` (lines 137–140) and uses `path.resolve` for `outputDir`; behavior is safe and consistent with analyze-component.

### limps create-plan and config (regression check)

- **create-plan**: [packages/limps/src/tools/create-plan.ts](packages/limps/src/tools/create-plan.ts) — No regressions found. Plan number extraction supports padded and unpadded dirs; `planExists` matches by full dir name or name-after-prefix; `hasNumberPrefix` avoids double prefix when name is e.g. `0042-limps-headless-pivot`. Atomic create (temp dir + rename) and index-after-create are correct. [packages/limps/tests/create-plan.test.ts](packages/limps/tests/create-plan.test.ts) covers valid name, next plan number, duplicate rejection, prefixed name, and template replacement.
- **config**: [packages/limps/src/config.ts](packages/limps/src/config.ts) — Only doc change: `extensions` comment now says e.g. `["@sudosandwich/limps-headless"]`. No change to loading, migration, or path resolution; existing tests remain valid.

---

## Questions / Assumptions

- **Repository URL**: `package.json` files use `github.com/paulbreuler/limps.git`; assumed to be the intended repo.
- **Extension config key**: Root README config examples use `@sudosandwich/limps-headless`; extension-specific config key remains `radix` (cacheDir) for backward compatibility.
- **Tests**: New tests under `packages/limps-headless/tests/` cover analyzer, differ, audit, providers, CLI flags, and tools; sequential Vitest and fixtures are in place. Assumption: no change to repo-wide test parallelism.

---

## Tests

- **Suggested**: Add a test for `generate-report` (or the MCP handler) that passes a path like `../other/analysis.json` and asserts it is rejected or resolved within a sandbox root, once path policy is decided.
- **Suggested**: Add an integration test for discovery with a custom `rootDir` (e.g. `fixtures/alt-components`) to lock the default vs override behavior.
- **Existing**: create-plan tests cover next plan number, duplicate rejection, and prefixed name (`0042-limps-headless-pivot`); watcher tests are CI-skipped where flaky; limps-headless tests cover analyze, audit, differ, providers, and CLI.

---

## README updates applied

- **Configuration** (root [README.md](README.md)): Config example `extensions` uses `@sudosandwich/limps-headless`.
- **Extensions**: Install command and config snippet use `@sudosandwich/limps-headless`; extension-specific config key remains `radix` (cacheDir) per limps-headless README. Available extensions list describes limps-headless.
- **Development**: Monorepo package list lists `packages/limps-headless` with a short description.
