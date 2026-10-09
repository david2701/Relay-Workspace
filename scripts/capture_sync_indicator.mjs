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

mkdirSync(outDir, { recursive: true });

const widths = [1440, 768, 390];

async function preparePage(context, width) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("relay.locale", "en");
  });
  // On collapsed rail, temporarily widen the foot so the seal text is readable.
  await page.addStyleTag({
    content: `
      .sync-seal { white-space: nowrap; overflow: visible; min-width: 120px; }
      @media (max-width: 1279px) {
        .rail { min-width: 160px !important; width: 160px !important; }
        .rail-label { display: block !important; }
        .app-shell { grid-template-columns: 160px minmax(0, 1fr) !important; }
      }
    `,
  });
  await page.goto(`${web}/attention`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sync-seal", { timeout: 15_000 });
  void width;
  return page;
}

async function shot(page, name) {
  const seal = page.locator(".sync-seal");
  await seal.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(350);
  await seal.screenshot({ path: join(outDir, `${name}.png`) });
  await page.screenshot({
    path: join(outDir, `${name}-viewport.png`),
    fullPage: false,
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width >= 1440 ? 900 : 800 },
      locale: "en-US",
    });
    const page = await preparePage(context, width);
    await expectConnected(page);
    await shot(page, `connected-${width}`);

    if (phase === "after") {
      await page.route("**/api/stream*", (route) => route.abort());
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".sync-seal");
      // Wait until seal leaves connected.
      await page.waitForFunction(
        () => {
          const el = document.querySelector(".sync-seal");
          return el && el.getAttribute("data-sync-state") !== "connected";
        },
        { timeout: 10_000 },
      );
      await shot(page, `reconnecting-${width}`);
      await page.unroute("**/api/stream*");
    }

    await page.route("**/api/**", (route) => route.abort());
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(3200);
    // Force offline label if the seal still shows reconnecting (3 fails).
    const state = await page.locator(".sync-seal").getAttribute("data-sync-state");
    if (state !== "offline") {
      await page.waitForTimeout(3000);
    }
    await shot(page, `offline-${width}`);
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify({ ok: true, phase, outDir }));
}

async function expectConnected(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".sync-seal");
      return el && /up to date|al día|à jour/i.test(el.textContent ?? "");
    },
    { timeout: 15_000 },
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
