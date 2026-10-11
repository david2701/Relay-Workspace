/**
 * Unpaired browser under RELAY_REQUIRE_TOKEN=1:
 * calm pairing state (no red errors), bounded EventSource connects,
 * register → inbox, revoke → unpaired again.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page, type Request } from "./fixtures";

const API_PORT = 7460;
const WEB_PORT = 7461;
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;

async function waitOk(url: string, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Not ready: ${url}`);
}

function start(cmd: string, env: Record<string, string>): ChildProcess {
  return spawn("bash", ["-lc", cmd], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
}

function pairCode(dbPath: string): string {
  const out = execFileSync(
    "pnpm",
    ["--filter", "@relay/server", "exec", "tsx", "scripts/pair.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELAY_DB: dbPath,
        RELAY_PUBLIC_URL: API,
      },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  const match = out.match(/Code:\s*(\d{6})/);
  if (!match?.[1]) throw new Error(`No pairing code in CLI output:\n${out}`);
  return match[1];
}

async function completeOnboardingIfPresent(page: Page): Promise<void> {
  const card = page.locator(".onboarding-card");
  if (await card.isVisible().catch(() => false)) {
    await page
      .getByRole("button", {
        name: /empezar vacío|start empty|commencer vide/i,
      })
      .click();
    await expect(card).toBeHidden({ timeout: 10_000 });
  }
}

test.describe.configure({ mode: "serial" });

test.describe("unpaired token auth UX", () => {
  // Own API+Vite on 7460/7461 — do not hit shared-server e2e-reset.
  test.use({ isolateSharedServer: false });

  let dbDir: string;
  let dbPath: string;
  let server: ChildProcess | null = null;
  let web: ChildProcess | null = null;

  test.beforeAll(async () => {
    dbDir = mkdtempSync(join(tmpdir(), "relay-unpaired-e2e-"));
    dbPath = join(dbDir, "relay.db");
    server = start(
      `pnpm --filter @relay/server exec tsx scripts/seed.ts && RELAY_DB=${dbPath} RELAY_HOST=127.0.0.1 RELAY_PORT=${API_PORT} RELAY_REQUIRE_TOKEN=1 RELAY_PUBLIC_URL=${API} RELAY_WEB_ORIGIN=${WEB} pnpm --filter @relay/server exec tsx src/index.ts`,
      { RELAY_DB: dbPath, RELAY_REQUIRE_TOKEN: "1" },
    );
    web = start(
      `VITE_API_URL=${API} pnpm --filter @relay/web exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      {},
    );
    await waitOk(`${API}/api/health`);
    await waitOk(WEB);
  });

  test.afterAll(() => {
    server?.kill("SIGTERM");
    web?.kill("SIGTERM");
    rmSync(dbDir, { recursive: true, force: true });
  });

  test("unpaired shows calm state; EventSource connects stay bounded", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("relay.locale", "en");
      localStorage.removeItem("relay.device_token");
    });

    const streamHits: number[] = [];
    page.on("request", (req: Request) => {
      if (req.url().includes("/api/stream")) streamHits.push(Date.now());
    });

    await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("pairing-required")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("pairing-required-title")).toContainText(
      /paired/i,
    );
    await expect(page.getByTestId("pairing-cli-cmd")).toContainText(
      "pnpm relay:pair",
    );

    await expect(page.locator(".banner.error")).toHaveCount(0);
    await expect(
      page.getByText(/Could not load this view|Couldn.?t load devices|Retry/i),
    ).toHaveCount(0);
    await expect(page.getByText(/Reconnecting/i)).toHaveCount(0);

    const seal = page.getByTestId("sync-seal");
    await expect(seal).toHaveAttribute("data-sync-state", "unpaired");
    await expect(seal).toHaveAttribute("aria-label", /Not paired/i);

    await page.waitForTimeout(8_000);
    expect(
      streamHits.length,
      `EventSource /api/stream hits should be bounded, got ${streamHits.length}`,
    ).toBeLessThanOrEqual(3);

    await page.goto(`${WEB}/?settings=devices`, { waitUntil: "networkidle" });
    const devices = page.getByTestId("devices-settings");
    await expect(devices).toBeVisible();
    await expect(devices.getByTestId("pairing-required")).toBeVisible();
    await expect(page.locator(".banner.error")).toHaveCount(0);
    await expect(page.locator(".settings-error")).toHaveCount(0);

    await context.close();
  });

  test("register loads inbox; revoke returns to unpaired", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("relay.locale", "en");
      localStorage.removeItem("relay.device_token");
    });

    await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("pairing-required")).toBeVisible({
      timeout: 15_000,
    });

    const code = pairCode(dbPath);
    await page.getByTestId("pairing-code-input").fill(code);
    await page.getByTestId("pairing-name-input").fill("E2E Browser");
    await page.getByTestId("pairing-register-btn").click();

    await expect(page.getByTestId("pairing-required")).toHaveCount(0, {
      timeout: 15_000,
    });
    await completeOnboardingIfPresent(page);
    await expect(page.getByTestId("sync-seal")).toHaveAttribute(
      "data-sync-state",
      "connected",
      { timeout: 15_000 },
    );
    await expect(page.locator("#quick-capture")).toBeVisible();
    await expect(page.getByTestId("pairing-required")).toHaveCount(0);

    const token = await page.evaluate(() =>
      localStorage.getItem("relay.device_token"),
    );
    expect(token).toBeTruthy();
    const listRes = await fetch(`${API}/api/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok).toBeTruthy();
    const listed = (await listRes.json()) as {
      devices: Array<{ id: string; name: string; revoked_at: string | null }>;
    };
    const mine = listed.devices.find(
      (d) => d.name === "E2E Browser" && !d.revoked_at,
    );
    expect(mine).toBeTruthy();
    const revokeRes = await fetch(`${API}/api/devices/${mine!.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revokeRes.ok).toBeTruthy();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("pairing-required")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("sync-seal")).toHaveAttribute(
      "data-sync-state",
      "unpaired",
    );
    await expect(page.locator(".banner.error")).toHaveCount(0);
    const cleared = await page.evaluate(() =>
      localStorage.getItem("relay.device_token"),
    );
    expect(cleared).toBeNull();

    await context.close();
  });
});
