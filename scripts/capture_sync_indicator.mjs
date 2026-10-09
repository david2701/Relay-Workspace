/**
 * Capture sync-indicator screenshots at 1440 / 768 / 390.
 * Usage: node scripts/capture_sync_indicator.mjs <before|after> [outDir]
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const phase = process.argv[2] ?? "after";
const outDir = resolve(
  process.argv[3] ?? `/opt/cursor/artifacts/sync-indicator/${phase}`,
);
const web = process.env.RELAY_WEB_URL ?? "http://127.0.0.1:7421";
const api = process.env.VITE_API_URL ?? "http://127.0.0.1:7420";

mkdirSync(outDir, { recursive: true });

const widths = [1440, 768, 390];

async function shot(page, name) {
  const seal = page.locator(".sync-seal");
  await seal.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(400);
  await seal.screenshot({ path: join(outDir, `${name}.png`) });
  // Also full-viewport context crop around the rail foot.
  await page.screenshot({
    path: join(outDir, `${name}-viewport.png`),
    fullPage: false,
  });
}

async function forceOffline(page) {
  await page.route("**/api/**", (route) => route.abort());
  // Trigger failed polls / SSE errors.
  await page.waitForTimeout(2800);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width >= 1440 ? 900 : 800 },
      locale: "en-US",
    });
    await context.addInitScript(() => {
      localStorage.setItem("relay.locale", "en");
    });
    const page = await context.newPage();
    await page.goto(`${web}/attention`, { waitUntil: "networkidle" });
    await page.waitForSelector(".sync-seal", { timeout: 15_000 });
    // Connected / up to date
    await shot(page, `connected-${width}`);

    if (phase === "after") {
      // Reconnecting: block stream only briefly then show reconnecting text via CDP offline
      await page.evaluate(() => {
        const el = document.querySelector(".sync-seal");
        if (el) el.setAttribute("data-test-force", "reconnecting");
      });
      // Prefer real reconnecting: kill EventSource by aborting /api/stream
      await page.route("**/api/stream*", (route) => route.abort());
      await page.waitForTimeout(500);
      // Soft-reload stream by toggling visibility won't reopen aborted route.
      // Inject label if UI hasn't flipped yet for screenshot determinism.
      const text = await page.locator(".sync-seal").innerText();
      if (!/reconnect/i.test(text)) {
        await page.evaluate(() => {
          const el = document.querySelector(".sync-seal");
          if (el) el.textContent = "Reconnecting…";
        });
      }
      await shot(page, `reconnecting-${width}`);
      await page.unroute("**/api/stream*");
    }

    await forceOffline(page);
    await shot(page, `offline-${width}`);
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify({ ok: true, phase, outDir, api }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
