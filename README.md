# Relay

Local-first shared work layer between one human (David) and his AI agents.
Work items with collaboration states, first-class notes, intentful reminders,
an attention inbox, an MCP server, and a professional Spanish web UI.

Canonical product brief: [`docs/task-hub-brief-v2.md`](docs/task-hub-brief-v2.md)  
UI specs (v1.1): [`docs/relay-ui-specs.md`](docs/relay-ui-specs.md)  
Plan: [`docs/PLAN.md`](docs/PLAN.md)  
MCP (EN): [`docs/mcp/README.en.md`](docs/mcp/README.en.md) · MCP (ES): [`docs/mcp/README.es.md`](docs/mcp/README.es.md)

## Stack

- Node.js **24.21+** · TypeScript 7 · pnpm workspaces · Vitest · Playwright
- `packages/core` — domain, zod schemas, SQLite (`node:sqlite` WAL)
- `apps/server` — Hono HTTP API + MCP (Streamable HTTP + stdio), same store
- `apps/web` — Vite + React SPA, 750 ms polling (visibility-aware, in-flight dedupe)
- `apps/apple/RelayKit` — Swift Package (models, API client, design tokens; no SwiftUI yet)
- `apps/android` — Jetpack Compose + Material 3 native client

`pnpm verify` covers the TypeScript monorepo only. Native builds are separate (see below).

## Install

```bash
nvm use   # or install Node 24.21+
corepack enable
pnpm install
pnpm seed   # builds @relay/core first, then seeds data/relay.db
```

`@relay/core` publishes through `dist/` (gitignored). After a clean install,
`pnpm build:core` emits that package. Root `pnpm typecheck`, `pnpm test`,
`pnpm test:e2e`, `pnpm seed`, `pnpm seed:large`, and `pnpm demo:ac3` run
`build:core` automatically. For `pnpm dev` on a fresh clone, run
`pnpm build:core` once (or any of those scripts) before starting.

## Run (one command)

```bash
pnpm build:core   # once after a clean install, if you have not seeded yet
pnpm dev
```

- Web: [http://127.0.0.1:7421](http://127.0.0.1:7421)
- API: [http://127.0.0.1:7420/api](http://127.0.0.1:7420/api)
- MCP Streamable HTTP: `http://127.0.0.1:7420/mcp`
- MCP JSON invoke helper (demos/tests): `POST http://127.0.0.1:7420/mcp/invoke`

Server binds to **127.0.0.1 only**. Data file: `data/relay.db` (WAL).

## MCP

Full reference (tools, actor identity, connection configs, errors, end-to-end flow):

- English: [`docs/mcp/README.en.md`](docs/mcp/README.en.md)
- Español: [`docs/mcp/README.es.md`](docs/mcp/README.es.md)

Verify documented tools match the server: `pnpm check:mcp-docs`.

Agents identify themselves with catalog id via:

- tool argument `actor: { id: "grok-bot", type: "agent" }`, or
- header `X-Relay-Actor: grok-bot`

Default agents: `grok-bot` (GB), `dev-senior` (DS), `ux-designer` (UX), `redactor` (RD), `qa` (QA).

### Streamable HTTP (example client config)

```json
{
  "mcpServers": {
    "relay": {
      "url": "http://127.0.0.1:7420/mcp"
    }
  }
}
```

### stdio

```bash
pnpm --filter @relay/server mcp:stdio
```

```json
{
  "mcpServers": {
    "relay": {
      "command": "pnpm",
      "args": ["--filter", "@relay/server", "mcp:stdio"],
      "env": {
        "RELAY_DB": "/absolute/path/to/data/relay.db"
      }
    }
  }
}
```

### AC3 demo loop

Isolated by default (temp SQLite — does **not** pollute `data/relay.db`):

```bash
pnpm demo:ac3                      # complete
pnpm demo:ac3 -- --variant=needs_you
pnpm demo:ac3 -- --variant=blocked
```

To drive the live web session (mutates the live DB):

```bash
RELAY_API=http://127.0.0.1:7420 pnpm demo:ac3 -- --variant=needs_you
```

`pnpm seed` always reset-and-seeds `RELAY_DB` (default `data/relay.db`). Playwright uses `/tmp/relay-e2e.db` on ports 7430/7431.

## Verify

```bash
pnpm typecheck   # builds @relay/core, then typechecks all packages
pnpm lint
pnpm test        # builds @relay/core, then unit tests
pnpm contrast
pnpm test:e2e    # builds @relay/core, then Playwright
pnpm verify      # full gate pipeline (install → build → … → i18n placeholder)
```

### Native (not part of `pnpm verify`)

```bash
# Apple shared package (Linux + macOS). Needs Swift 5.10 toolchain.
cd apps/apple/RelayKit && swift build && swift test

# Android (JDK 17, Android SDK). Gradle wrapper included.
cd apps/android
./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest
```

SwiftUI Mac/iPhone apps are intentionally **not** in this repo yet — they need Xcode on a Mac. See `apps/apple/README.md`.

## CI (Origin)

Origin does **not** ship a native workflow runner. For Origin-hosted repos, CI runs
through the **Depot** or **Buildkite** app
([Origin Apps](https://cursor.com/docs/origin/apps);
[Depot × Origin](https://depot.dev/docs/ci/integrations/origin)).
Check results appear on the pull request **Checks** tab
(`origin pr checks` / `origin pr view --checks`).

This repo defines the gate pipeline as:

- [`.depot/workflows/ci.yml`](.depot/workflows/ci.yml) — Depot CI (active once Depot is installed on the codebase)
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — same steps in GitHub Actions form (Depot migrate source / twin)
- `pnpm verify` / `scripts/ci.sh` — local mirror of the same gates

Pipeline (clean checkout): `pnpm install --frozen-lockfile` → `build` → `typecheck` →
`lint` → `test` → `contrast` → Playwright browsers (`--with-deps`) → `test:e2e` →
`check:mcp-docs` → `check:i18n-missing-keys` (placeholder until v0.3 block 2).

Version while Enseñable is open: **`0.3.0-dev`** (see [`CHANGELOG.md`](CHANGELOG.md)).
No `v0.3.0` tag until the round closes.

## Fonts

Schibsted Grotesk and IBM Plex Mono are self-hosted under `apps/web/public/fonts/`
(SIL OFL 1.1). Confirmed embeddable. Documented UI fallback if Schibsted cannot
load: Onest / Hanken Grotesk / Figtree — **not** Inter, Geist, or Roboto.
