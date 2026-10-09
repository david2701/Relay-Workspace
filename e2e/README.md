# Relay Playwright e2e

## Isolation model

The full suite shares one long-lived API + Vite `webServer` (see
`playwright.config.ts`). Order-dependent flakes in `cross_process_mcp` and
`sse_realtime` came from that shared process: SQLite/`item_events` seq rewinds
after `/api/seed` or `prepare-onboarding`, SSE hub cursors that stayed high
across resets, and `EventSource` clients that could accumulate toward
`RELAY_SSE_MAX_CONNECTIONS` (default 50 → HTTP 503).

Isolation layers:

| Layer | What it does |
| --- | --- |
| **Worker-scoped DB + ports** | `RELAY_DB=/tmp/relay-e2e-w${WORKER}.db`, API `7430+2W`, web `7431+2W`. Default `workers: 1` (`fullyParallel: false`). |
| **`RELAY_E2E=1`** | Registers `POST /api/store/e2e-reset`. Without the flag the route is **not registered** (404). |
| **Loopback gate** | Even with the flag, proxied or non-loopback clients get **403**. Covered by `apps/server/tests/e2e_reset.test.ts`. |
| **Auto reset fixture** | `e2e/fixtures.ts` calls e2e-reset before and after every shared-server test: reseed demo + completed onboarding, `streamHub.reset()` (detach all SSE clients, resync `lastKnownSeq`). |
| **Hub reset on seed** | `/api/seed` and `/store/prepare-onboarding` also call `streamHub.reset()` so mid-test restores cannot poison live cursors. |
| **Opt-out** | Specs that spawn their own API/web (`unpaired_token_auth`) use `test.use({ isolateSharedServer: false })`. |

## Running

```bash
# Same gate as CI (Node >= 24.21, FTS5 via node:sqlite)
pnpm verify

# Playwright only
pnpm test:e2e
```

Do **not** raise `workers` above 1 unless each worker gets its own DB file and
port pair (same formula as above). Multiple workers on one `RELAY_DB` will
reintroduce cross-talk.

## Writing specs

```ts
import { expect, test, E2E_API, readHeadSeq } from "./fixtures";

// Shared server (default): auto e2e-reset
test("…", async ({ page, request }) => {
  const head = await readHeadSeq(request);
  // …
});

// Own server: skip shared reset
test.use({ isolateSharedServer: false });
```

Prefer explicit readiness (`data-sync-state=connected`, `readHeadSeq`) over
fixed sleeps. Close pages normally; the fixture reset clears any hub leftovers
server-side.
