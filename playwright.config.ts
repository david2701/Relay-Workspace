import { defineConfig } from "@playwright/test";

const E2E_API = "http://127.0.0.1:7430";
const E2E_WEB = "http://127.0.0.1:7431";
const E2E_DB = "/tmp/relay-e2e.db";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: E2E_WEB,
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: `rm -f ${E2E_DB} ${E2E_DB}-wal ${E2E_DB}-shm && RELAY_DB=${E2E_DB} pnpm --filter @relay/server exec tsx scripts/seed.ts && RELAY_DB=${E2E_DB} RELAY_HOST=127.0.0.1 RELAY_PORT=7430 RELAY_WEB_ORIGIN=${E2E_WEB} pnpm --filter @relay/server exec tsx src/index.ts`,
      url: `${E2E_API}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `VITE_API_URL=${E2E_API} pnpm --filter @relay/web exec vite --host 127.0.0.1 --port 7431 --strictPort`,
      url: E2E_WEB,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
