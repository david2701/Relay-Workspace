import { defineConfig } from "@playwright/test";

/**
 * Isolation model (see e2e/README.md):
 * - One Playwright worker by default (`workers: 1`) so specs share a single
 *   webServer process safely.
 * - That process uses a worker-scoped SQLite file + ports:
 *     DB   /tmp/relay-e2e-w${WORKER}.db
 *     API  7430 + 2*WORKER
 *     WEB  7431 + 2*WORKER
 * - RELAY_E2E=1 enables POST /api/store/e2e-reset (loopback-only).
 * - e2e/fixtures.ts auto-resets DB + SSE hub before/after each shared-server
 *   spec so order-dependent flakes cannot ride on leftover connections or
 *   seq cursors. Specs with their own servers opt out via
 *   `test.use({ isolateSharedServer: false })`.
 *
 * Raising `workers` above 1 requires starting one webServer set per worker
 * (same port/DB formula). Do not point multiple workers at one RELAY_DB.
 */
const WORKER = Number(process.env.E2E_WORKER_INDEX ?? "0");
const E2E_API_PORT = 7430 + WORKER * 2;
const E2E_WEB_PORT = 7431 + WORKER * 2;
const E2E_API = `http://127.0.0.1:${E2E_API_PORT}`;
const E2E_WEB = `http://127.0.0.1:${E2E_WEB_PORT}`;
const E2E_DB = `/tmp/relay-e2e-w${WORKER}.db`;

process.env.E2E_API_URL = E2E_API;
process.env.E2E_WEB_URL = E2E_WEB;
process.env.VITE_API_URL = E2E_API;
process.env.RELAY_DB = E2E_DB;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  // Keep at 1 unless each worker has its own DB+ports (see README).
  workers: 1,
  use: {
    baseURL: E2E_WEB,
    headless: true,
    viewport: { width: 1440, height: 900 },
    // Keep legacy Spanish UI selectors working in existing e2e; i18n specs
    // override via addInitScript / localStorage.clear.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: E2E_WEB,
          localStorage: [{ name: "relay.locale", value: "es" }],
        },
      ],
    },
  },
  webServer: [
    {
      command: `rm -f ${E2E_DB} ${E2E_DB}-wal ${E2E_DB}-shm && RELAY_DB=${E2E_DB} pnpm --filter @relay/server exec tsx scripts/seed.ts && RELAY_E2E=1 RELAY_DB=${E2E_DB} RELAY_HOST=127.0.0.1 RELAY_PORT=${E2E_API_PORT} RELAY_WEB_ORIGIN=${E2E_WEB} pnpm --filter @relay/server exec tsx src/index.ts`,
      url: `${E2E_API}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        RELAY_E2E: "1",
        RELAY_DB: E2E_DB,
        RELAY_HOST: "127.0.0.1",
        RELAY_PORT: String(E2E_API_PORT),
        RELAY_WEB_ORIGIN: E2E_WEB,
      },
    },
    {
      command: `VITE_API_URL=${E2E_API} pnpm --filter @relay/web exec vite --host 127.0.0.1 --port ${E2E_WEB_PORT} --strictPort`,
      url: E2E_WEB,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
