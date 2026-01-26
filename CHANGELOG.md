# Changelog

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
