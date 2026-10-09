/**
 * Full-viewport + indicator-crop screenshots for sync seal states.
 *
 * Usage:
 *   RELAY_WEB_URL=http://127.0.0.1:7421 node scripts/capture_sync_indicator.mjs after
 *   RELAY_WEB_URL=http://127.0.0.1:7423 node scripts/capture_sync_indicator.mjs before
 *
 * Outputs (light keeps legacy names; dark adds -dark):
 *   /opt/cursor/artifacts/sync-indicator/{phase}/{state}-{width}.png
 *   /opt/cursor/artifacts/sync-indicator/{phase}/{state}-{width}-crop.png
 *   /opt/cursor/artifacts/sync-indicator/{phase}/{state}-{width}-dark.png
 *   /opt/cursor/artifacts/sync-indicator/{phase}/{state}-{width}-dark-crop.png
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

/** @type {Array<"light" | "dark">} */
const themes = ["light", "dark"];

mkdirSync(outDir, { recursive: true });
for (const stale of ["connected", "reconnecting", "offline"]) {
  for (const w of [1440, 768, 390]) {
    for (const theme of themes) {
      const themeSuffix = theme === "dark" ? "-dark" : "";
      for (const suffix of ["", "-crop"]) {
        try {
          rmSync(join(outDir, `${stale}-${w}${themeSuffix}${suffix}.png`), {
            force: true,
          });
        } catch {
          // ignore
        }
      }
    }
  }
}

/**
 * Match seal by data-sync-state and/or aria-label / textContent
 * (collapsed rail hides the label visually).
 */
async function waitSealState(page, statePattern, labelPattern) {
  await page.waitForSelector(".sync-seal", { timeout: 20_000 });
  await page.waitForFunction(
    ({ stateRe, labelRe }) => {
      const el = document.querySelector(".sync-seal");
      if (!el) return false;
      const state = el.getAttribute("data-sync-state") ?? "";
      if (!new RegExp(stateRe, "i").test(state)) return false;
      const label =
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.textContent ||
        "";
      return new RegExp(labelRe, "i").test(label);
    },
    { stateRe: statePattern, labelRe: labelPattern },
    { timeout: 20_000 },
  );
}

async function gotoAttention(page) {
  await page.goto(`${web}/attention`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sync-seal", { timeout: 20_000 });
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem("relay.theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.waitForFunction(
    (wantDark) =>
      document.documentElement.classList.contains("dark") === wantDark,
    theme === "dark",
  );
}

/**
 * Full-viewport shots stay honest. Crops may temporarily hide the fixed
 * detail pane that covers the rail at ≤1023 (QA-PR4-1).
 */
async function prepareCropChrome(page, width) {
  if (width > 1023) return;
  await page.addStyleTag({
    content: `
      .detail-zone, .detail-scrim { display: none !important; }
    `,
  });
}

function fileBase(state, width, theme) {
  const themeSuffix = theme === "dark" ? "-dark" : "";
  return `${state}-${width}${themeSuffix}`;
}

async function shotFullAndCrop(page, state, width, theme) {
  const base = fileBase(state, width, theme);
  const fullPath = join(outDir, `${base}.png`);
  const cropPath = join(outDir, `${base}-crop.png`);

  await page.screenshot({ path: fullPath, fullPage: false });

  await prepareCropChrome(page, width);
  await page.waitForTimeout(120);
  const seal = page.locator(".sync-seal");
  await seal.waitFor({ state: "visible", timeout: 10_000 });
  const box = await seal.boundingBox();
  if (!box || box.width < 4 || box.height < 4) {
    throw new Error(
      `sync-seal not measurable for ${base}: ${JSON.stringify(box)}`,
    );
  }
  const label =
    (await seal.getAttribute("aria-label")) ||
    (await seal.getAttribute("title")) ||
    (await seal.innerText()).trim();
  const padX = 16;
  const padY = 12;
  const vw = page.viewportSize().width;
  const vh = page.viewportSize().height;
  // Include enough room for the status dot (+ label when expanded).
  const clipW = Math.max(box.width + padX * 2, width > 1279 ? 200 : 48);
  const clip = {
    x: Math.max(0, Math.min(box.x - padX, vw - clipW)),
    y: Math.max(0, box.y - padY),
    width: Math.min(clipW, vw),
    height: Math.min(box.height + padY * 2, vh),
  };
  await page.screenshot({ path: cropPath, clip });
  return { fullPath, cropPath, text: label, box, clip, theme };
}

async function forceOffline(page) {
  await page.route("**/api/**", (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(4500);
  await waitSealState(page, "offline", "offline|sin conex|hors ligne");
}

async function forceReconnecting(page) {
  await page.route("**/api/stream*", (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitSealState(page, "reconnecting|offline", "reconnect|reconect|reconnexion|offline|hors ligne|sin conex");
}

async function openFirstItem(page) {
  const opt = page.getByRole("option").first();
  if (await opt.count()) {
    await opt.click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function captureWidthTheme(browser, width, height, theme) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "en-US",
    colorScheme: theme,
  });
  await context.addInitScript((t) => {
    localStorage.setItem("relay.locale", "en");
    localStorage.setItem("relay.theme", t);
  }, theme);
  const page = await context.newPage();
  const report = [];

  await gotoAttention(page);
  await setTheme(page, theme);
  await waitSealState(page, "connected", "up to date|al d[ií]a|à jour");
  await page.waitForTimeout(800);
  await waitSealState(page, "connected", "up to date|al d[ií]a|à jour");
  if (width === 390) {
    await openFirstItem(page);
  }
  const connected = await shotFullAndCrop(page, "connected", width, theme);
  if (!/up to date|al d[ií]a|à jour/i.test(connected.text)) {
    throw new Error(`connected-${width}-${theme} seal text was "${connected.text}"`);
  }
  report.push({ state: "connected", ...connected });

  if (hasReconnecting) {
    await context.close();
    const ctx2 = await browser.newContext({
      viewport: { width, height },
      locale: "en-US",
      colorScheme: theme,
    });
    await ctx2.addInitScript((t) => {
      localStorage.setItem("relay.locale", "en");
      localStorage.setItem("relay.theme", t);
    }, theme);
    const page2 = await ctx2.newPage();
    await gotoAttention(page2);
    await setTheme(page2, theme);
    await waitSealState(page2, "connected", "up to date|al d[ií]a|à jour");
    await forceReconnecting(page2);
    if (width === 390) await openFirstItem(page2);
    report.push({
      state: "reconnecting",
      ...(await shotFullAndCrop(page2, "reconnecting", width, theme)),
    });
    await forceOffline(page2);
    if (width === 390) await openFirstItem(page2);
    report.push({
      state: "offline",
      ...(await shotFullAndCrop(page2, "offline", width, theme)),
    });
    await ctx2.close();
    return report;
  }

  await forceOffline(page);
  if (width === 390) await openFirstItem(page);
  report.push({
    state: "offline",
    ...(await shotFullAndCrop(page, "offline", width, theme)),
  });
  await context.close();
  return report;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  /** @type {unknown[]} */
  const all = [];
  for (const { width, height } of viewports) {
    for (const theme of themes) {
      const rows = await captureWidthTheme(browser, width, height, theme);
      all.push({ width, height, theme, rows });
      console.log(
        JSON.stringify({
          width,
          height,
          theme,
          states: rows.map((r) => ({
            state: r.state,
            text: r.text,
            full: r.fullPath,
            crop: r.cropPath,
          })),
        }),
      );
    }
  }
  await browser.close();
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(all, null, 2));
  console.log(JSON.stringify({ ok: true, phase, outDir, hasReconnecting }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
