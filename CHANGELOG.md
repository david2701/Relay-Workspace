# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Heading toward **0.3.0** («Enseñable»).

### Added

- Realtime `GET /api/stream` (SSE): `id`/`event`/`data` from `item_events`, `Last-Event-ID` / `after_seq` replay, 15 s heartbeat, connection cap, far-behind `resync`, cross-process `MAX(seq)` watcher; web drops 750 ms polling for EventSource (`docs/api/stream.md`).
- Global `item_events` log with monotonic `seq` (migration 6), `GET /api/items/:id/events`, `GET /api/changes`, inbox `seq` / `after_seq`, and MCP `items_events` / `changes_list` (SSE foundation).
- Clean-clone DX: root `pnpm build:core` so `typecheck` / `test` / `test:e2e` / `seed` work after `pnpm install` without a pre-built `packages/core/dist`.
- CI pipeline definition for Origin via Depot (`.depot/workflows/ci.yml`) plus a GitHub Actions–compatible twin (`.github/workflows/ci.yml`) and local `pnpm verify` / `scripts/ci.sh`.
- `contrast` gate in `scripts/ci.sh` and both workflow files (same order as README Verify).
- i18n base (EN/FR/ES): typed JSON locale files, Intl formats, language detection + selector, configurable timezone, non-hardcoded human user.
- Real `check:i18n-missing-keys` and `check:hardcoded-strings` CI gates (AC3-L2 / AC3-L3).
- Minimal first-run onboarding card (ui-spec §3 / AC3-O1): empty + preloaded variants, sample seed by locale, `onboarding_completed_at` on the server.
- Settings gaps closed versus ui-spec §2: name/initial validation + counter, autosave, timezone combobox, theme, version, keyboard (`G S`, `Esc`, `?settings=`).
- One-command demo (`pnpm demo` / `pnpm demo:reset`): dedicated `data/relay-demo.db`, EN sample data with relative Today/Tomorrow dues, onboarding left open (PR1 / AC3-D1–D4).

### Changed

- Package versions set to `0.3.0-dev` while the Enseñable round is open (no `v0.3.0` tag until the round closes).
- Renamed the local gate script entry to `pnpm verify` (previous script name collided with a pnpm built-in and never ran `scripts/ci.sh`).
- MCP server `version` is read from `@relay/server` `package.json` (no hardcoded drift).
- List-row title truncates instead of painting over DueChip/meta at narrow widths; DatePicker e2e waits for fonts and settled layout.
