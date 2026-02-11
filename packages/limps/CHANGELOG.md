# Changelog

## [3.3.0](https://github.com/paulbreuler/limps/compare/limps-v3.2.0...limps-v3.3.0) (2026-02-11)


### Features

* **cli:** add --set flag to update agent status ([#127](https://github.com/paulbreuler/limps/issues/127)) ([27ccd0f](https://github.com/paulbreuler/limps/commit/27ccd0f08442e360e3e0d3c7e24ec96e885d98c3))
* **cli:** add create-plan command ([#129](https://github.com/paulbreuler/limps/issues/129)) ([2acf106](https://github.com/paulbreuler/limps/commit/2acf1067efc9d95d445b20701dfc68f2ff845a5d))
* **cli:** add document management commands ([#131](https://github.com/paulbreuler/limps/issues/131)) ([13058fe](https://github.com/paulbreuler/limps/commit/13058fe42c0c8dc99827d2ff304a1c1051f32e68))
* **cli:** add process command for document querying ([#132](https://github.com/paulbreuler/limps/issues/132)) ([1e1fe99](https://github.com/paulbreuler/limps/commit/1e1fe994874bd4e80eb2ffbc987a247ee16dfc22))
* **config:** add config resolution diagnostics for MCP_PLANNING_CONFIG priority issues ([#119](https://github.com/paulbreuler/limps/issues/119)) ([a2f0700](https://github.com/paulbreuler/limps/commit/a2f07004de598a68eb45558e007f99ed03c7e87d))
* **create-plan:** support strict body placeholders ([#137](https://github.com/paulbreuler/limps/issues/137)) ([588a31b](https://github.com/paulbreuler/limps/commit/588a31bfc4b93dfa2e7810e6a46f934ce17213ef))


### Bug Fixes

* **cli:** support status --set for non-canonical plansPath ([#136](https://github.com/paulbreuler/limps/issues/136)) ([ec4e53f](https://github.com/paulbreuler/limps/commit/ec4e53ff3142bd66c1fb3ad10a6fa6507198c88f))
* **limps:** clarify daemon wording in default command help ([#126](https://github.com/paulbreuler/limps/issues/126)) ([227aa7c](https://github.com/paulbreuler/limps/commit/227aa7cd93d8ee5b4e18bd2c5764b5327fb5cf52))
* **tools:** update_task_status writes agent frontmatter ([#128](https://github.com/paulbreuler/limps/issues/128)) ([2d44aac](https://github.com/paulbreuler/limps/commit/2d44aac39edaa251df4d52651c74bdb7760d4354))

## [3.2.0](https://github.com/paulbreuler/limps/compare/limps-v3.1.1...limps-v3.2.0) (2026-02-09)


### Features

* support both stdio and HTTP transports for MCP clients ([#114](https://github.com/paulbreuler/limps/issues/114)) ([660ad59](https://github.com/paulbreuler/limps/commit/660ad59861a1e1fe2d1da7af92ffa01bd005bfff))

## [3.1.1](https://github.com/paulbreuler/limps/compare/limps-v3.1.0...limps-v3.1.1) (2026-02-09)


### Bug Fixes

* **limps:** use OS-standard directories for PID files with system-wide daemon discovery ([#111](https://github.com/paulbreuler/limps/issues/111)) ([42fc4d2](https://github.com/paulbreuler/limps/commit/42fc4d2878a437902f441bc33cc92397f84cb609))

## [3.1.0](https://github.com/paulbreuler/limps/compare/limps-v3.0.0...limps-v3.1.0) (2026-02-08)


### Features

* **limps:** refactor HTTP client with typed error handling ([#108](https://github.com/paulbreuler/limps/issues/108)) ([4c48803](https://github.com/paulbreuler/limps/commit/4c4880386bcf2684e42f83fa69f366e75d928bbd))

## [3.0.0](https://github.com/paulbreuler/limps/compare/limps-v2.13.3...limps-v3.0.0) (2026-02-07)


### ⚠ BREAKING CHANGES

* **limps:** Default `corsOrigin` changed from `'*'` to `''`. Cross-origin requests are now blocked by default. Set `server.corsOrigin: '*'` in config to restore the previous behavior.
* **limps:** The 'serve' command is removed. Use 'start' instead.

### Features

* **limps:** add persistent HTTP server with daemon mode ([#103](https://github.com/paulbreuler/limps/issues/103)) ([776e1db](https://github.com/paulbreuler/limps/commit/776e1db368d63200ee396f95b45d163d0fbb559f))
* **limps:** HTTP server release prep with secure CORS defaults ([#105](https://github.com/paulbreuler/limps/issues/105)) ([b0cd462](https://github.com/paulbreuler/limps/commit/b0cd4626b24628588a1a11b8bd4ed445bde016c3))

## [2.13.3](https://github.com/paulbreuler/limps/compare/limps-v2.13.2...limps-v2.13.3) (2026-02-07)


### Bug Fixes

* **limps:** restore graph reindex + directory delete safeguards ([#101](https://github.com/paulbreuler/limps/issues/101)) ([f9b7490](https://github.com/paulbreuler/limps/commit/f9b7490b11255ce757046c1950134da5a7c033fa))

## [2.13.2](https://github.com/paulbreuler/limps/compare/limps-v2.13.1...limps-v2.13.2) (2026-02-07)


### Bug Fixes

* harden watcher lifecycle and prevent resource leaks ([#96](https://github.com/paulbreuler/limps/issues/96)) ([09587d6](https://github.com/paulbreuler/limps/commit/09587d66fa0c60c1876032c71a99b18a6e2856b8))

## [2.13.1](https://github.com/paulbreuler/limps/compare/limps-v2.13.0...limps-v2.13.1) (2026-02-06)


### Bug Fixes

* **config:** remove docsPaths, validate paths on startup, add e2e tests ([#89](https://github.com/paulbreuler/limps/issues/89)) ([c9253d1](https://github.com/paulbreuler/limps/commit/c9253d1536be0b413a3a41e9363ba22288178514))
* **config:** remove OS-level config fallback and auto-create behavior ([#91](https://github.com/paulbreuler/limps/issues/91)) ([f1655dd](https://github.com/paulbreuler/limps/commit/f1655dd43158a865bc22db61d465b1a11ff0a6a5))

## [2.13.0](https://github.com/paulbreuler/limps/compare/limps-v2.12.0...limps-v2.13.0) (2026-02-06)


### Features

* **graph:** implement entity resolution with hybrid retrieval ([#82](https://github.com/paulbreuler/limps/issues/82)) ([57fae02](https://github.com/paulbreuler/limps/commit/57fae0218a1a972acc1729c1ff30b2a88b8e6865))
* **limps:** agent frontmatter prevention, repair, and plans-summary fix, opencode mcp config ([#81](https://github.com/paulbreuler/limps/issues/81)) ([cdeb236](https://github.com/paulbreuler/limps/commit/cdeb236d48a79901d77e2a30c6615718152dd7ac))
* **limps:** finalize knowledge graph CLI, MCP tools, and harden adversarial findings ([#83](https://github.com/paulbreuler/limps/issues/83)) ([7399b60](https://github.com/paulbreuler/limps/commit/7399b6051f7e6b5d5cb9d18fc2bcfe6aa5adb6f2))

## [2.12.0](https://github.com/paulbreuler/limps/compare/limps-v2.11.0...limps-v2.12.0) (2026-02-04)


### Features

* **ci:** add MCP Registry publish via mcp-publisher OIDC ([#76](https://github.com/paulbreuler/limps/issues/76)) ([54b0d3d](https://github.com/paulbreuler/limps/commit/54b0d3dac2ab23b447fc1f85441d1fee4b07db84))
* **health:** add code drift detection for agent file references ([#72](https://github.com/paulbreuler/limps/issues/72)) ([e9b69c6](https://github.com/paulbreuler/limps/commit/e9b69c6116322fb99fab2dc766e7ce364b19a831))
* **health:** add status inference (Phase 3 - Agent 002) ([#74](https://github.com/paulbreuler/limps/issues/74)) ([bead0a9](https://github.com/paulbreuler/limps/commit/bead0a9061f539ecdf572ab53f2f71a6fc0454f0))
* **limps:** add proposals and health automation ([#75](https://github.com/paulbreuler/limps/issues/75)) ([9c7d46b](https://github.com/paulbreuler/limps/commit/9c7d46b765600a2689627b32c2ea85899efb15cd))
* **limps:** add staleness health checks ([#70](https://github.com/paulbreuler/limps/issues/70)) ([34ae09a](https://github.com/paulbreuler/limps/commit/34ae09a54889cb97b3f4bc7f3d1d4295318f9885))

## [2.11.0](https://github.com/paulbreuler/limps/compare/limps-v2.10.0...limps-v2.11.0) (2026-02-02)


### Features

* **limps:** add version json output and update notices ([#68](https://github.com/paulbreuler/limps/issues/68)) ([8bbd510](https://github.com/paulbreuler/limps/commit/8bbd510ac8a23bf2d558fb00947557e77545e91f))

## [2.10.0](https://github.com/paulbreuler/limps/compare/limps-v2.9.0...limps-v2.10.0) (2026-02-01)


### Features

* **limps:** add scoring config tool and MCP hardening ([#66](https://github.com/paulbreuler/limps/issues/66)) ([bfda66f](https://github.com/paulbreuler/limps/commit/bfda66f58482eea9e29c1dd9408a8b980424de3a))

## [2.9.0](https://github.com/paulbreuler/limps/compare/limps-v2.8.0...limps-v2.9.0) (2026-02-01)


### Features

* **limps:** add graph storage scaffolding ([#59](https://github.com/paulbreuler/limps/issues/59)) ([08f3769](https://github.com/paulbreuler/limps/commit/08f376987bab928def7c47a150eb8b51480d1762))
* **limps:** add tool filtering and planning skill docs ([#62](https://github.com/paulbreuler/limps/issues/62)) ([679f466](https://github.com/paulbreuler/limps/commit/679f466f3e0956d867ddc99dab5f308eb7ff2d75))
* **limps:** granular scoring overrides and cli tools ([#64](https://github.com/paulbreuler/limps/issues/64)) ([37fc345](https://github.com/paulbreuler/limps/commit/37fc345112c3ef29dba0bf98a1d2895a7111da3c))


### Bug Fixes

* **limps:** honor depends_on in next-task scoring ([#65](https://github.com/paulbreuler/limps/issues/65)) ([59f6584](https://github.com/paulbreuler/limps/commit/59f65846e2f0aa01d8f07de98bd79729d937ee3e))

## [2.8.0](https://github.com/paulbreuler/limps/compare/limps-v2.7.0...limps-v2.8.0) (2026-01-31)


### Features

* **config:** projects layout, migrate, coordination cleanup ([#54](https://github.com/paulbreuler/limps/issues/54)) ([b0bade9](https://github.com/paulbreuler/limps/commit/b0bade9736b3091443a256286ae59b6f27e96fd9))

## [2.7.0](https://github.com/paulbreuler/limps/compare/limps-v2.6.1...limps-v2.7.0) (2026-01-31)

### BREAKING CHANGES

* **plan feature format:** Legacy plan feature format (`## Feature N: Title`, `**Status:** GAP`) is deprecated. The canonical format is `### #N: Title` and `Status: \`GAP\``. Run `npm run migrate:plan-feature-format` from `packages/limps` (or `npx tsx scripts/migrate-plan-feature-format.ts [plans-dir]`) to migrate existing plan files. Backward compatibility for reading/writing both formats remains in this release but may be removed in a future major or minor release.
  

### Features

* **limps-headless:** add headless UI audit package ([#50](https://github.com/paulbreuler/limps/issues/50)) ([bcc069a](https://github.com/paulbreuler/limps/commit/bcc069a6157af09145096551174bc0ee3f5bcbac))
* **limps-radix:** add component analyzer ([#47](https://github.com/paulbreuler/limps/issues/47)) ([9df1925](https://github.com/paulbreuler/limps/commit/9df1925b1259f4480646a17cb1d60fe1773016c6))

## [2.6.1](https://github.com/paulbreuler/limps/compare/limps-v2.6.0...limps-v2.6.1) (2026-01-29)


### Bug Fixes

* **packages:** add prepublishOnly to copy README and LICENSE ([#45](https://github.com/paulbreuler/limps/issues/45)) ([11f0001](https://github.com/paulbreuler/limps/commit/11f000170908d776e0e432417c70a4d57f64e552))

## [2.6.0](https://github.com/paulbreuler/limps/compare/limps-v2.5.0...limps-v2.6.0) (2026-01-29)


### Features

* **limps-headless,claude:** implement agents 007-008 and add review skills ([#39](https://github.com/paulbreuler/limps/issues/39)) ([777e107](https://github.com/paulbreuler/limps/commit/777e10765b10ed64c4b9ddede4d566696b1f0ab2))
* **limps-headless:** implement Radix UI extension with signature generation and caching ([#36](https://github.com/paulbreuler/limps/issues/36)) ([1134be0](https://github.com/paulbreuler/limps/commit/1134be033aab412fdffa911f929512a6811038dc))

## [2.5.0](https://github.com/paulbreuler/limps/compare/v2.4.0...v2.5.0) (2026-01-27)


### Features

* extension support and safer config sync ([#27](https://github.com/paulbreuler/limps/issues/27)) ([c1d393a](https://github.com/paulbreuler/limps/commit/c1d393af6a6d511c6e051040f52e08c617af267c))

## [2.4.0](https://github.com/paulbreuler/limps/compare/v2.3.0...v2.4.0) (2026-01-27)


### Features

* add config migration and rename add-claude to sync-mcp ([#24](https://github.com/paulbreuler/limps/issues/24)) ([31a5f91](https://github.com/paulbreuler/limps/commit/31a5f9101830e8212c73c1168dbc69683f76c0b8))


### Bug Fixes

* remove aggressive frontmatter healing feature ([#26](https://github.com/paulbreuler/limps/issues/26)) ([d74f04e](https://github.com/paulbreuler/limps/commit/d74f04e4bd87be7a70f22937c1ee3ff8140a51f7))

## [2.3.0](https://github.com/paulbreuler/limps/compare/v2.2.0...v2.3.0) (2026-01-27)


### Features

* add configurable scoring weights for task prioritization ([#19](https://github.com/paulbreuler/limps/issues/19)) ([6a99af9](https://github.com/paulbreuler/limps/commit/6a99af9f30028e3e74bb950841786ccfbc2ad89a))
* add MCP client config management command ([#16](https://github.com/paulbreuler/limps/issues/16)) ([702f134](https://github.com/paulbreuler/limps/commit/702f134593345fff72877f9c9a4877729cb5da03))
* add settled watcher processing ([#22](https://github.com/paulbreuler/limps/issues/22)) ([4901beb](https://github.com/paulbreuler/limps/commit/4901beb820d73668518b7ed16680e03c17571d54))


### Bug Fixes

* preserve scoring config when loading and display in config show ([#20](https://github.com/paulbreuler/limps/issues/20)) ([9e053f3](https://github.com/paulbreuler/limps/commit/9e053f3e9d33f094ffbf854b927b6a1a8f9f8e3c))
* preserve scoring config when loading and display in config show ([#21](https://github.com/paulbreuler/limps/issues/21)) ([51f33f9](https://github.com/paulbreuler/limps/commit/51f33f94890fe29a69782de191b3269dd0f8bb00))

## [2.2.0](https://github.com/paulbreuler/limps/compare/v2.1.0...v2.2.0) (2026-01-27)


### Features

* add Obsidian-compatible frontmatter to all docs ([#14](https://github.com/paulbreuler/limps/issues/14)) ([108d36b](https://github.com/paulbreuler/limps/commit/108d36bb4591cef35c0091ce2a218807adfa14c5))

## [2.1.0](https://github.com/paulbreuler/limps/compare/v2.0.0...v2.1.0) (2026-01-27)


### Features

* add Obsidian-compatible frontmatter and tag management ([#12](https://github.com/paulbreuler/limps/issues/12)) ([686c336](https://github.com/paulbreuler/limps/commit/686c3362f13c31cde8bcabf61d9d7369888a8249))

## [2.0.0](https://github.com/paulbreuler/limps/compare/v1.1.1...v2.0.0) (2026-01-26)


### ⚠ BREAKING CHANGES

* remove coordination system (v2.0.0) ([#10](https://github.com/paulbreuler/limps/issues/10))

### Code Refactoring

* remove coordination system (v2.0.0) ([#10](https://github.com/paulbreuler/limps/issues/10)) ([cf188b3](https://github.com/paulbreuler/limps/commit/cf188b32cffaba77c87d7a48bf8d3c8576e6dda7))

## [1.1.1](https://github.com/paulbreuler/limps/compare/v1.1.0...v1.1.1) (2026-01-25)


### Bug Fixes

* Update version tests to handle dynamic version and update messages ([#8](https://github.com/paulbreuler/limps/issues/8)) ([9bb515e](https://github.com/paulbreuler/limps/commit/9bb515e64d7c343496e0e434a6e17592bf138197))

## [1.1.0](https://github.com/paulbreuler/limps/compare/v1.0.2...v1.1.0) (2026-01-25)


### Features

* Add version command and automatic update checking ([#5](https://github.com/paulbreuler/limps/issues/5)) ([eece1d1](https://github.com/paulbreuler/limps/commit/eece1d1eda00bbcf601b5d185d021f5c7bd703fd))


### Bug Fixes

* Build CLI before running tests in all workflows ([#6](https://github.com/paulbreuler/limps/issues/6)) ([00101c7](https://github.com/paulbreuler/limps/commit/00101c7d542fb44b5e04d3e99b575730c2932efd))
* Build CLI before running tests in release workflow ([8a8c172](https://github.com/paulbreuler/limps/commit/8a8c172919c50102d4c6f913846507aeb180622b))

## [1.0.2](https://github.com/paulbreuler/limps/compare/v1.0.1...v1.0.2) (2026-01-25)


### Bug Fixes

* use raw image link for limps in action ([034e05f](https://github.com/paulbreuler/limps/commit/034e05fae23666bba050032c540bcaffc7b9481b))

## [1.0.1](https://github.com/paulbreuler/limps/compare/v1.0.0...v1.0.1) (2026-01-25)


### Bug Fixes

* add npm publish job to release-please workflow ([094332a](https://github.com/paulbreuler/limps/commit/094332ae137967a56b5de9aea20306eb17716407))
* use absolute URL for gif in README for npm display ([91a5ed5](https://github.com/paulbreuler/limps/commit/91a5ed59cc8c8fbfb095ecdf8c9bfc43cb430f4a))

## 1.0.0 (2026-01-25)


### Features

* add automated release notes generation using GitHub API ([eaffc55](https://github.com/paulbreuler/limps/commit/eaffc55f83f84863d24dffe8cd364864d9cc0cb1))
* add global npm install support with OS-specific config paths ([eaddd89](https://github.com/paulbreuler/limps/commit/eaddd8907ebd198d4e7a94c47dcf7b3bcb80de6c))
* add release-please for automated versioning ([ba471d5](https://github.com/paulbreuler/limps/commit/ba471d5e9e6340c480d96c80aa620e405cf8ff4a))
* initial commit - extract MCP planning server to standalone repository ([d354433](https://github.com/paulbreuler/limps/commit/d3544335f2b26c4c90c828f1aa90b077570b3159))
* refactor CLI to Ink + Pastel framework ([#1](https://github.com/paulbreuler/limps/issues/1)) ([f7613e4](https://github.com/paulbreuler/limps/commit/f7613e4d33a9df29edd4aae6e00fd80a2f483b5c))


### Bug Fixes

* correct @types/which version from ^4.0.4 to ^3.0.4 ([6ea0f43](https://github.com/paulbreuler/limps/commit/6ea0f4376e1f6782d1e60ad1299925737ef838a0))
* correct test paths for extracted repository structure ([8ae7d69](https://github.com/paulbreuler/limps/commit/8ae7d69356446179709e9acf84d6d5fc06722d3c))
* grant write permissions to publish workflow for git tags ([80eb12c](https://github.com/paulbreuler/limps/commit/80eb12c7d5df75a79eb0b53b26cae5453bbacf57))
