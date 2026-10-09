/**
 * Full-viewport sync-seal screenshots (primary evidence). Crops are optional.
 *
 * Usage:
 *   RELAY_WEB_URL=http://127.0.0.1:7421 node scripts/capture_sync_indicator.mjs after
 *
 * Deliverables (after):
 *   EN light+dark @ 1440 & 768 × connected|reconnecting|offline
 *   FR + ES light @ 768 × connected|reconnecting|offline
 *
 * Naming:
 *   {state}-{width}.png              EN light
 *   {state}-{width}-dark.png         EN dark
 *   {state}-768-fr.png / -es.png     FR/ES light @ 768
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
const wantCrops = process.env.SYNC_CAPTURE_CROPS === "1";

/** @type {Array<{ width: number; height: number }>} */
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
];

mkdirSync(outDir, { recursive: true });

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} statePattern
 * @param {string} labelPattern
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

async function setLocale(page, locale) {
  await page.evaluate((loc) => {
    localStorage.setItem("relay.locale", loc);
  }, locale);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".sync-seal", { timeout: 20_000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} state
 * @param {number} width
 * @param {{ theme?: string; locale?: string }} opts
 */
async function shotFull(page, state, width, opts = {}) {
  const theme = opts.theme ?? "light";
  const locale = opts.locale ?? "en";
  let suffix = "";
  if (locale !== "en") suffix += `-${locale}`;
  if (theme === "dark") suffix += "-dark";
  const base = `${state}-${width}${suffix}`;
  const fullPath = join(outDir, `${base}.png`);
  await page.screenshot({ path: fullPath, fullPage: false });

  let cropPath = null;
  if (wantCrops) {
    cropPath = join(outDir, `${base}-crop.png`);
    if (width <= 1023) {
      await page.addStyleTag({
        content: `.detail-zone, .detail-scrim { display: none !important; }`,
      });
      await page.waitForTimeout(80);
    }
    const seal = page.locator(".sync-seal");
    const box = await seal.boundingBox();
    if (box) {
      const padX = 16;
      const padY = 12;
      const vw = page.viewportSize().width;
      const vh = page.viewportSize().height;
      const clipW = Math.max(box.width + padX * 2, width > 1279 ? 200 : 48);
      await page.screenshot({
        path: cropPath,
        clip: {
          x: Math.max(0, Math.min(box.x - padX, vw - clipW)),
          y: Math.max(0, box.y - padY),
          width: Math.min(clipW, vw),
          height: Math.min(box.height + padY * 2, vh),
        },
      });
    }
  }

  const seal = page.locator(".sync-seal");
  const text =
    (await seal.getAttribute("aria-label")) ||
    (await seal.getAttribute("title")) ||
    "";
  return { fullPath, cropPath, text, base };
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
  await waitSealState(
    page,
    "reconnecting",
    "reconnect|reconect|reconnexion",
  );
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {number} width
 * @param {number} height
 * @param {"light"|"dark"} theme
 * @param {"en"|"fr"|"es"} locale
 */
async function captureCombo(browser, width, height, theme, locale) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-US",
    colorScheme: theme,
  });
  await context.addInitScript(
    ({ loc, th }) => {
      localStorage.setItem("relay.locale", loc);
      localStorage.setItem("relay.theme", th);
    },
    { loc: locale, th: theme },
  );
  const page = await context.newPage();
  const report = [];

  const connectedLabel =
    locale === "fr"
      ? "à jour"
      : locale === "es"
        ? "al d[ií]a"
        : "up to date";

  await gotoAttention(page);
  await setTheme(page, theme);
  if ((await page.evaluate(() => localStorage.getItem("relay.locale"))) !== locale) {
    await setLocale(page, locale);
    await setTheme(page, theme);
  }
  await waitSealState(page, "connected", connectedLabel);
  await page.waitForTimeout(600);
  await waitSealState(page, "connected", connectedLabel);
  report.push({
    state: "connected",
    ...(await shotFull(page, "connected", width, { theme, locale })),
  });

  if (hasReconnecting) {
    await forceReconnecting(page);
    await setTheme(page, theme);
    report.push({
      state: "reconnecting",
      ...(await shotFull(page, "reconnecting", width, { theme, locale })),
    });
    await forceOffline(page);
    await setTheme(page, theme);
    report.push({
      state: "offline",
      ...(await shotFull(page, "offline", width, { theme, locale })),
    });
  } else {
    await forceOffline(page);
    await setTheme(page, theme);
    report.push({
      state: "offline",
      ...(await shotFull(page, "offline", width, { theme, locale })),
    });
  }

  await context.close();
  return report;
}

async function main() {
  // Clear prior deliverables for this phase.
  for (const stale of ["connected", "reconnecting", "offline"]) {
    for (const w of [1440, 768, 390]) {
      for (const extra of ["", "-dark", "-fr", "-es", "-fr-dark", "-es-dark"]) {
        for (const suffix of ["", "-crop"]) {
          try {
            rmSync(join(outDir, `${stale}-${w}${extra}${suffix}.png`), {
              force: true,
            });
          } catch {
            // ignore
          }
        }
      }
    }
  }

  const browser = await chromium.launch({ headless: true });
  /** @type {unknown[]} */
  const all = [];

  /** @type {Array<{ width: number; height: number; theme: "light"|"dark"; locale: "en"|"fr"|"es" }>} */
  const jobs = [];
  for (const { width, height } of viewports) {
    for (const theme of /** @type {const} */ (["light", "dark"])) {
      jobs.push({ width, height, theme, locale: "en" });
    }
  }
  // FR/ES evidence at 768 light (full viewport).
  for (const locale of /** @type {const} */ (["fr", "es"])) {
    jobs.push({ width: 768, height: 1024, theme: "light", locale });
  }

  for (const job of jobs) {
    const rows = await captureCombo(
      browser,
      job.width,
      job.height,
      job.theme,
      job.locale,
    );
    all.push({ ...job, rows });
    console.log(
      JSON.stringify({
        ...job,
        states: rows.map((r) => ({
          state: r.state,
          text: r.text,
          full: r.fullPath,
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
