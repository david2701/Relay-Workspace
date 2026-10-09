/**
 * Capture unpaired pairing UX under RELAY_REQUIRE_TOKEN=1.
 * - Main view + Settings at 1440 / 768 / 390
 * - After registration at 1440
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const API = "http://127.0.0.1:7470";
const WEB = "http://127.0.0.1:7471";
const DB = "/tmp/relay-unpaired-capture.db";
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

function pairCode() {
  const out = execFileSync(
    "pnpm",
    ["--filter", "@relay/server", "exec", "tsx", "scripts/pair.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELAY_DB: DB,
        RELAY_PUBLIC_URL: API,
      },
      encoding: "utf8",
    },
  );
  const match = out.match(/Code:\s*(\d{6})/);
  if (!match?.[1]) throw new Error(`No pairing code:\n${out}`);
  return match[1];
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  rmSync(DB, { force: true });
  rmSync(`${DB}-wal`, { force: true });
  rmSync(`${DB}-shm`, { force: true });

  const server = start(
    `pnpm --filter @relay/server exec tsx scripts/seed.ts && RELAY_DB=${DB} RELAY_HOST=127.0.0.1 RELAY_PORT=7470 RELAY_REQUIRE_TOKEN=1 RELAY_PUBLIC_URL=${API} RELAY_WEB_ORIGIN=${WEB} pnpm --filter @relay/server exec tsx src/index.ts`,
    { RELAY_DB: DB, RELAY_REQUIRE_TOKEN: "1" },
  );
  const web = start(
    `VITE_API_URL=${API} pnpm --filter @relay/web exec vite --host 127.0.0.1 --port 7471 --strictPort`,
    {},
  );

  try {
    await waitOk(`${API}/api/health`);
    await waitOk(WEB);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("relay.locale", "en");
      localStorage.removeItem("relay.device_token");
    });

    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
      await page.getByTestId("pairing-required").waitFor({ timeout: 15_000 });
      await page.screenshot({
        path: `${OUT}/unpaired-main-${w}.png`,
        fullPage: false,
      });
    }

    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${WEB}/?settings=devices`, { waitUntil: "networkidle" });
      await page.getByTestId("pairing-required").waitFor({ timeout: 15_000 });
      await page.screenshot({
        path: `${OUT}/unpaired-settings-${w}.png`,
        fullPage: false,
      });
    }

    // Register via CLI code, then capture main inbox at 1440.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
    await page.getByTestId("pairing-required").waitFor({ timeout: 15_000 });
    const code = pairCode();
    await page.getByTestId("pairing-code-input").fill(code);
    await page.getByTestId("pairing-name-input").fill("Capture browser");
    await page.getByTestId("pairing-register-btn").click();
    await page.getByTestId("pairing-required").waitFor({ state: "hidden", timeout: 15_000 });
    await page.getByTestId("sync-seal").waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `${OUT}/paired-main-1440.png`,
      fullPage: false,
    });

    // Legacy filename: Settings unpaired at 1440 (fresh context, no token).
    const pageLegacy = await browser.newPage();
    await pageLegacy.addInitScript(() => {
      localStorage.setItem("relay.locale", "en");
      localStorage.removeItem("relay.device_token");
    });
    await pageLegacy.setViewportSize({ width: 1440, height: 900 });
    await pageLegacy.goto(`${WEB}/?settings=devices`, {
      waitUntil: "networkidle",
    });
    await pageLegacy
      .getByTestId("pairing-required")
      .waitFor({ timeout: 15_000 });
    await pageLegacy.screenshot({
      path: `${OUT}/devices-cli-bootstrap-1440.png`,
      fullPage: false,
    });
    await pageLegacy.close();

    await browser.close();
    writeFileSync(
      `${OUT}/unpaired-capture-note.txt`,
      "Unpaired shots use RELAY_REQUIRE_TOKEN=1 with no device token. Main + Settings at 1440/768/390; paired-main-1440 after register.\n",
    );
    console.log("Wrote unpaired screenshots to", OUT);
  } finally {
    server.kill("SIGTERM");
    web.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
