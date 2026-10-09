/**
 * Full-viewport + indicator-crop screenshots for sync seal states.
 *
 * Usage:
 *   RELAY_WEB_URL=http://127.0.0.1:7421 node scripts/capture_sync_indicator.mjs after
 *   RELAY_WEB_URL=http://127.0.0.1:7423 node scripts/capture_sync_indicator.mjs before
 *
 * Outputs:
 *   /opt/cursor/artifacts/sync-indicator/{phase}/{state}-{width}.png       (full viewport)
 *   /opt/cursor/artifacts/sync-indicator/{phase}/{state}-{width}-crop.png  (seal crop)
 *
 * Viewports: 1440×900, 768×1024, 390×844
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const phase = process.argv[2];
if (phase !== "before" && phase !== "after") {
  console.error("Usage: capture_sync_indicator.mjs <before|after>");
  process.exit(1);
}

const outDir = resolve(
  process.argv[3] ?? `/opt/cursor/artifacts/sync-indicator/${phase}`,
);
const web = process.env.RELAY_WEB_URL ?? "http://127.0.0.1:7421";
const hasReconnecting = phase === "after";

/** @type {Array<{ width: number; height: number }>} */
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

mkdirSync(outDir, { recursive: true });
// Clear prior mistyped artifacts for this phase.
for (const stale of [
  "connected",
  "reconnecting",
  "offline",
]) {
  for (const w of [1440, 768, 390]) {
    for (const suffix of ["-viewport.png", ".png", "-crop.png"]) {
      try {
        if (suffix === ".png" || suffix === "-crop.png") continue;
        rmSync(join(outDir, `${stale}-${w}${suffix}`), { force: true });
      } catch {
        // ignore
      }
    }
  }
}

async function waitSeal(page, pattern) {
  await page.waitForSelector(".sync-seal", { timeout: 20_000 });
  await page.waitForFunction(
    (re) => {
      const el = document.querySelector(".sync-seal");
      return !!el && new RegExp(re, "i").test(el.textContent ?? "");
    },
    pattern,
    { timeout: 20_000 },
  );
}

async function gotoAttention(page) {
  await page.goto(`${web}/attention`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sync-seal", { timeout: 20_000 });
}

/**
 * Full-viewport shots stay honest. Crops may temporarily:
 * - hide the fixed detail pane that covers the rail at ≤1023 (QA-PR4-1)
 * - widen the collapsed rail so the seal text is not clipped mid-word
 */
async function prepareCropChrome(page, width) {
  if (width > 1279) return;
  await page.addStyleTag({
    content: `
      .detail-zone, .detail-scrim { display: none !important; }
      .rail {
        min-width: 200px !important;
        width: 200px !important;
        overflow: visible !important;
        z-index: 60 !important;
      }
      .rail-label { display: block !important; }
      .rail-foot, .sync-seal {
        overflow: visible !important;
        white-space: nowrap !important;
      }
      .app-shell {
        grid-template-columns: 200px minmax(0, 1fr) !important;
      }
    `,
  });
}

async function shotFullAndCrop(page, state, width) {
  const fullPath = join(outDir, `${state}-${width}.png`);
  const cropPath = join(outDir, `${state}-${width}-crop.png`);

  // Full viewport — as the user sees it (no CSS hacks).
  await page.screenshot({ path: fullPath, fullPage: false });

  // Crop — widen rail / hide covering detail so the seal text is fully readable.
  await prepareCropChrome(page, width);
  await page.waitForTimeout(120);
  const seal = page.locator(".sync-seal");
  await seal.waitFor({ state: "visible", timeout: 10_000 });
  const box = await seal.boundingBox();
  if (!box || box.width < 8 || box.height < 8) {
    throw new Error(`sync-seal not measurable for ${state}-${width}: ${JSON.stringify(box)}`);
  }
  const text = (await seal.innerText()).trim();
  const padX = 16;
  const padY = 12;
  const vw = page.viewportSize().width;
  const vh = page.viewportSize().height;
  // Prefer a wide enough clip for the longest seal string (~180px).
  const clipW = Math.max(box.width + padX * 2, 200);
  const clip = {
    x: Math.max(0, Math.min(box.x - padX, vw - clipW)),
    y: Math.max(0, box.y - padY),
    width: Math.min(clipW, vw),
    height: Math.min(box.height + padY * 2, vh),
  };
  await page.screenshot({ path: cropPath, clip });
  return { fullPath, cropPath, text, box, clip };
}

async function forceOffline(page) {
  await page.route("**/api/**", (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  // Polling: 3 failed polls at 750ms ≈ 2.25s+. SSE: 3 EventSource errors.
  await page.waitForTimeout(4500);
  await waitSeal(page, "offline|sin conex|hors ligne");
}

async function forceReconnecting(page) {
  await page.route("**/api/stream*", (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitSeal(page, "reconnect|reconect|reconnexion");
}

async function openFirstItem(page) {
  // At ≤1023px the empty detail pane intercepts clicks (QA-PR4-1).
  const opt = page.getByRole("option").first();
  if (await opt.count()) {
    await opt.click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function captureWidth(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "en-US",
  });
  await context.addInitScript(() => {
    localStorage.setItem("relay.locale", "en");
  });
  const page = await context.newPage();
  const report = [];

  // —— connected ——
  await gotoAttention(page);
  await waitSeal(page, "up to date|al d[ií]a|à jour");
  // Re-check after a beat — flaky offline from a cold API must not ship as connected.
  await page.waitForTimeout(800);
  await waitSeal(page, "up to date|al d[ií]a|à jour");
  if (width === 390) {
    // Attempt: open an item (detail still covers rail at 390 — documented).
    await openFirstItem(page);
  }
  const connected = await shotFullAndCrop(page, "connected", width);
  if (!/up to date|al d[ií]a|à jour/i.test(connected.text)) {
    throw new Error(`connected-${width} seal text was "${connected.text}"`);
  }
  report.push({ state: "connected", ...connected });

  // —— reconnecting (after / SSE only) ——
  if (hasReconnecting) {
    // Fresh page for clean stream abort (avoid leftover offline routes).
    await context.close();
    const ctx2 = await browser.newContext({
      viewport: { width, height },
      locale: "en-US",
    });
    await ctx2.addInitScript(() => {
      localStorage.setItem("relay.locale", "en");
    });
    const page2 = await ctx2.newPage();
    await gotoAttention(page2);
    await waitSeal(page2, "up to date|al d[ií]a|à jour");
    await forceReconnecting(page2);
    if (width === 390) await openFirstItem(page2);
    report.push({
      state: "reconnecting",
      ...(await shotFullAndCrop(page2, "reconnecting", width)),
    });
    await forceOffline(page2);
    if (width === 390) await openFirstItem(page2);
    report.push({
      state: "offline",
      ...(await shotFullAndCrop(page2, "offline", width)),
    });
    await ctx2.close();
    return report;
  }

  // —— offline (before / polling) ——
  await forceOffline(page);
  if (width === 390) await openFirstItem(page);
  report.push({
    state: "offline",
    ...(await shotFullAndCrop(page, "offline", width)),
  });
  await context.close();
  return report;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  /** @type {unknown[]} */
  const all = [];
  for (const { width, height } of viewports) {
    const rows = await captureWidth(browser, width, height);
    all.push({ width, height, rows });
    console.log(
      JSON.stringify({
        width,
        height,
        states: rows.map((r) => ({
          state: r.state,
          text: r.text,
          full: r.fullPath,
          crop: r.cropPath,
        })),
      }),
    );
  }
  await browser.close();
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(all, null, 2));
  console.log(JSON.stringify({ ok: true, phase, outDir, hasReconnecting }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
