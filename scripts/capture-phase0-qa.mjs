/**
 * Capture before/after screenshots for phase-0 QA fixes.
 * Usage: node scripts/capture-phase0-qa.mjs before|after
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const phase = process.argv[2] === "after" ? "after" : "before";
const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "artifacts",
  "phase0-qa",
  phase,
);
mkdirSync(outDir, { recursive: true });

const API = process.env.RELAY_API_URL ?? "http://127.0.0.1:7430";
const WEB = process.env.RELAY_WEB_URL ?? "http://127.0.0.1:7431";

async function putSettings(patch) {
  const res = await fetch(`${API}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`settings ${res.status}: ${await res.text()}`);
}

async function seed(locale) {
  const res = await fetch(`${API}/api/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });
  if (!res.ok) throw new Error(`seed ${res.status}: ${await res.text()}`);
}

async function prepareOnboarding() {
  const res = await fetch(`${API}/api/store/prepare-onboarding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant: "empty", locale: "en" }),
  });
  if (!res.ok) throw new Error(`onboarding ${res.status}: ${await res.text()}`);
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log("wrote", path);
}

async function captureCancelled(browser, locale, width) {
  await seed(locale);
  await putSettings({
    timezone: "Europe/Paris",
    user_display_name: "Alex",
    user_initial: "A",
    onboarding_completed_at: new Date().toISOString(),
  });
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    locale: locale === "en" ? "en-US" : locale === "fr" ? "fr-FR" : "es-ES",
  });
  const page = await context.newPage();
  await page.addInitScript((loc) => {
    localStorage.setItem("relay.locale", loc);
  }, locale);
  await page.goto(`${WEB}/done`);
  await page.waitForSelector('[data-inbox-view="done"]');
  // Narrow layouts park an empty detail overlay over the list; hide it for the row shot.
  if (width < 1024) {
    await page.addStyleTag({
      content:
        ".detail-zone:has(.detail-empty){display:none!important;pointer-events:none!important}",
    });
  }
  const cancelledTitle =
    locale === "fr"
      ? "Réserver un domaine produit de secours"
      : locale === "es"
        ? "Reservar un dominio de producto de respaldo"
        : "Reserve a backup product domain";
  const row = page.getByRole("option", { name: new RegExp(cancelledTitle) });
  await row.first().scrollIntoViewIfNeeded();
  await shot(page, `cancelled-row-${locale}-${width}`);
  await row.first().click({ force: true });
  await page.waitForSelector(
    ".detail-zone .completed-by, .detail-zone .reason-banner.terminal",
  );
  await shot(page, `cancelled-detail-${locale}-${width}`);
  await context.close();
}

async function captureUtcOnboarding(browser, width) {
  await prepareOnboarding();
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    timezoneId: "UTC",
    locale: "en-US",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("relay.locale", "en");
  });
  await page.goto(`${WEB}/attention`);
  await page.waitForSelector(".onboarding-card");
  await shot(page, `onboarding-utc-${width}`);
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en", "fr", "es"]) {
    for (const width of [1440, 390]) {
      await captureCancelled(browser, locale, width);
    }
  }
  // Tablet sample for cancelled (EN only) and UTC onboarding.
  await captureCancelled(browser, "en", 768);
  for (const width of [1440, 390, 768]) {
    await captureUtcOnboarding(browser, width);
  }
} finally {
  await browser.close();
  // Restore e2e-friendly baseline.
  await seed("en");
  await putSettings({
    timezone: "Europe/Paris",
    user_display_name: "Alex",
    user_initial: "A",
    onboarding_completed_at: new Date().toISOString(),
  });
}
console.log("done", phase);
