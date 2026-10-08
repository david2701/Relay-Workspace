# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Heading toward **0.3.0** («Enseñable»).

### Added

- Clean-clone DX: root `pnpm build:core` so `typecheck` / `test` / `test:e2e` / `seed` work after `pnpm install` without a pre-built `packages/core/dist`.
- CI pipeline definition for Origin via Depot (`.depot/workflows/ci.yml`) plus a GitHub Actions–compatible twin (`.github/workflows/ci.yml`) and local `pnpm ci` / `scripts/ci.sh`.
- Placeholder `check:i18n-missing-keys` step (block 2 will replace the no-op).

### Changed

- Package versions set to `0.3.0-dev` while the Enseñable round is open (no `v0.3.0` tag until the round closes).
