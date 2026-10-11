import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, E2E_API, E2E_DB } from "./fixtures";


async function waitHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server not healthy: ${url}`);
}

test.describe("device pairing (Settings + LAN token)", () => {
  test("pair from Settings, claim, use token on non-loopback, revoke → 401", async ({
    page,
  }) => {
    await page.goto("/?settings=devices");
    await expect(page.getByTestId("devices-settings")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("devices-empty")).toBeVisible();

    await page.getByTestId("pair-phone-btn").click();
    await expect(page.getByTestId("pairing-panel")).toBeVisible();
    await expect(page.getByTestId("pairing-code")).toBeVisible();
    await expect(page.getByTestId("pairing-qr")).toBeVisible({
      timeout: 5_000,
    });
    const code = (await page.getByTestId("pairing-code").innerText()).trim();
    expect(code).toMatch(/^\d{6}$/);

    const claimRes = await page.request.post(`${E2E_API}/api/pair/claim`, {
      data: {
        code,
        device_name: "E2E Phone",
        platform: "android",
      },
    });
    expect(claimRes.ok()).toBeTruthy();
    const claimed = (await claimRes.json()) as {
      token: string;
      device_id: string;
    };
    expect(claimed.token.length).toBeGreaterThan(20);

    // Non-loopback bind with token enforcement (same DB as e2e seed).
    const lanDir = mkdtempSync(join(tmpdir(), "relay-lan-e2e-"));
    const lanDb = E2E_DB;
    const lanPort = 7432;
    let child: ChildProcess | null = null;
    try {
      child = spawn(
        "pnpm",
        ["--filter", "@relay/server", "exec", "tsx", "src/index.ts"],
        {
          cwd: join(process.cwd()),
          env: {
            ...process.env,
            RELAY_DB: lanDb,
            RELAY_HOST: "0.0.0.0",
            RELAY_PORT: String(lanPort),
            RELAY_REQUIRE_TOKEN: "1",
            RELAY_PUBLIC_URL: `http://127.0.0.1:${lanPort}`,
            RELAY_WEB_ORIGIN: "http://127.0.0.1:7431",
          },
          stdio: "pipe",
        },
      );
      await waitHealth(`http://127.0.0.1:${lanPort}`);

      const noToken = await fetch(`http://127.0.0.1:${lanPort}/api/items`);
      expect(noToken.status).toBe(401);

      const withToken = await fetch(`http://127.0.0.1:${lanPort}/api/items`, {
        headers: { Authorization: `Bearer ${claimed.token}` },
      });
      expect(withToken.status).toBe(200);

      const revoke = await page.request.delete(
        `${E2E_API}/api/devices/${claimed.device_id}`,
      );
      expect(revoke.ok()).toBeTruthy();

      const afterRevoke = await fetch(`http://127.0.0.1:${lanPort}/api/items`, {
        headers: { Authorization: `Bearer ${claimed.token}` },
      });
      expect(afterRevoke.status).toBe(401);
    } finally {
      if (child?.pid) {
        child.kill("SIGTERM");
      }
      rmSync(lanDir, { recursive: true, force: true });
    }

    await page.reload();
    await page.goto("/?settings=devices");
    await expect(page.getByTestId("devices-settings")).toBeVisible();
    // Revoked device still listed under revoked, or empty active list.
    await expect(page.getByText("E2E Phone")).toBeVisible();
  });
});
