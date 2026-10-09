/**
 * Capture Settings → Devices screenshots at 1440 / 768 / 390.
 * States: empty, pairing (QR+code), two devices.
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const API = "http://127.0.0.1:7450";
const WEB = "http://127.0.0.1:7451";
const DB = "/tmp/relay-devices-capture.db";
const OUT = "/opt/cursor/artifacts/screenshots";

const WIDTHS = [1440, 768, 390];

async function waitOk(url, ms = 60_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for ${url}`);
}

function start(cmd, env) {
  return spawn("bash", ["-lc", cmd], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  rmSync(DB, { force: true });
  rmSync(`${DB}-wal`, { force: true });
  rmSync(`${DB}-shm`, { force: true });

  const server = start(
    `pnpm --filter @relay/server exec tsx scripts/seed.ts && RELAY_DB=${DB} RELAY_HOST=127.0.0.1 RELAY_PORT=7450 RELAY_WEB_ORIGIN=${WEB} pnpm --filter @relay/server exec tsx src/index.ts`,
    { RELAY_DB: DB },
  );
  const web = start(
    `VITE_API_URL=${API} pnpm --filter @relay/web exec vite --host 127.0.0.1 --port 7451 --strictPort`,
    {},
  );

  try {
    await waitOk(`${API}/api/health`);
    await waitOk(WEB);

    // Complete onboarding via API so Settings opens cleanly.
    await fetch(`${API}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Relay-Source": "ui" },
      body: JSON.stringify({
        user_display_name: "Capture",
        user_initial: "C",
        timezone: "UTC",
        onboarding_completed_at: new Date().toISOString(),
      }),
    });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("relay.locale", "en");
    });

    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${WEB}/?settings=devices`, { waitUntil: "networkidle" });
      await page.getByTestId("devices-settings").waitFor({ timeout: 15_000 });
      await page.getByTestId("devices-empty").waitFor();
      await page.screenshot({
        path: `${OUT}/devices-empty-${w}.png`,
        fullPage: true,
      });
    }

    // Pairing panel with QR + code
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${WEB}/?settings=devices`, { waitUntil: "networkidle" });
    await page.getByTestId("pair-phone-btn").click();
    await page.getByTestId("pairing-panel").waitFor();
    await page.getByTestId("pairing-qr").waitFor();
    const code = (await page.getByTestId("pairing-code").innerText()).trim();

    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${OUT}/devices-pairing-${w}.png`,
        fullPage: true,
      });
    }

    // Claim first device with the visible code, start another pair, claim second via API
    await fetch(`${API}/api/pair/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        device_name: "iPhone",
        platform: "ios",
      }),
    });
    const start2 = await fetch(`${API}/api/pair/start`, { method: "POST" });
    const session2 = await start2.json();
    await fetch(`${API}/api/pair/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session2.code,
        device_name: "Pixel",
        platform: "android",
      }),
    });

    await page.goto(`${WEB}/?settings=devices`, { waitUntil: "networkidle" });
    await page.getByTestId("devices-list").waitFor({ timeout: 15_000 });

    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${OUT}/devices-two-${w}.png`,
        fullPage: true,
      });
    }

    await browser.close();

    // Token-required bootstrap UI (separate server with RELAY_REQUIRE_TOKEN=1).
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    const tokenServer = start(
      `RELAY_DB=${DB} RELAY_HOST=127.0.0.1 RELAY_PORT=7450 RELAY_REQUIRE_TOKEN=1 RELAY_PUBLIC_URL=http://127.0.0.1:7450 RELAY_WEB_ORIGIN=${WEB} pnpm --filter @relay/server exec tsx src/index.ts`,
      { RELAY_DB: DB, RELAY_REQUIRE_TOKEN: "1" },
    );
    try {
      await waitOk(`${API}/api/health`);
      const browser2 = await chromium.launch({ headless: true });
      const page2 = await browser2.newPage();
      await page2.addInitScript(() => {
        localStorage.setItem("relay.locale", "en");
        localStorage.removeItem("relay.device_token");
      });
      for (const w of WIDTHS) {
        await page2.setViewportSize({ width: w, height: 900 });
        await page2.goto(`${WEB}/?settings=devices`, {
          waitUntil: "networkidle",
        });
        await page2.getByTestId("pairing-required").waitFor({
          timeout: 15_000,
        });
        await page2.screenshot({
          path: `${OUT}/devices-cli-bootstrap-${w}.png`,
          fullPage: true,
        });
      }
      await browser2.close();
    } finally {
      tokenServer.kill("SIGTERM");
    }

    writeFileSync(
      `${OUT}/devices-capture-note.txt`,
      "390 viewport may show the known detail-pane overlay depending on prior navigation; captures open Settings via ?settings=devices. CLI bootstrap shots use RELAY_REQUIRE_TOKEN=1.\n",
    );
    console.log("Wrote screenshots to", OUT);
  } finally {
    server.kill("SIGTERM");
    web.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
