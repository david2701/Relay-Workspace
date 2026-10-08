# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Heading toward **0.3.0** («Enseñable»).

### Added

- Clean-clone DX: root `pnpm build:core` so `typecheck` / `test` / `test:e2e` / `seed` work after `pnpm install` without a pre-built `packages/core/dist`.
- CI pipeline definition for Origin via Depot (`.depot/workflows/ci.yml`) plus a GitHub Actions–compatible twin (`.github/workflows/ci.yml`) and local `pnpm verify` / `scripts/ci.sh`.
- `contrast` gate in `scripts/ci.sh` and both workflow files (same order as README Verify).
- i18n base (EN/FR/ES): typed JSON locale files, Intl formats, language detection + selector, configurable timezone, non-hardcoded human user.
- Real `check:i18n-missing-keys` and `check:hardcoded-strings` CI gates (AC3-L2 / AC3-L3).

### Changed

- Package versions set to `0.3.0-dev` while the Enseñable round is open (no `v0.3.0` tag until the round closes).
- Renamed the local gate script entry to `pnpm verify` (previous script name collided with a pnpm built-in and never ran `scripts/ci.sh`).
- MCP server `version` is read from `@relay/server` `package.json` (no hardcoded drift).
- List-row title truncates instead of painting over DueChip/meta at narrow widths; DatePicker e2e waits for fonts and settled layout.
