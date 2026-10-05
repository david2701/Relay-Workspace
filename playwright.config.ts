import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:7421",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command:
        "RELAY_DB=/workspace/data/relay-e2e.db RELAY_HOST=127.0.0.1 RELAY_PORT=7420 pnpm --filter @relay/server exec tsx src/index.ts",
      url: "http://127.0.0.1:7420/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @relay/web dev",
      url: "http://127.0.0.1:7421",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
