/**
 * Capture Settings timezone mismatch banner for PR #9 v2.
 * Usage: node scripts/capture-pr9-v2-tz.mjs before|after
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
  "pr9-v2",
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

async function seed() {
  const res = await fetch(`${API}/api/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "en" }),
  });
  if (!res.ok) throw new Error(`seed ${res.status}: ${await res.text()}`);
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log("wrote", path);
}

async function openTimezoneSettings(page, width) {
  await page.addInitScript(() => {
    localStorage.setItem("relay.locale", "en");
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${WEB}/attention?settings=timezone`);
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  return dialog;
}

/**
 * Cases:
 * a) browser Etc/UTC, saved Etc/UTC
 * b) browser UTC, saved Etc/UTC
 * c) browser Europe/Paris, saved Etc/UTC (control — mismatch expected)
 */
const cases = [
  { id: "a-etcutc-browser-etcutc-saved", browserTz: "Etc/UTC", saved: "Etc/UTC", widths: [1440, 768, 390] },
  { id: "b-utc-browser-etcutc-saved", browserTz: "UTC", saved: "Etc/UTC", widths: [1440, 768, 390] },
  { id: "c-paris-browser-etcutc-saved", browserTz: "Europe/Paris", saved: "Etc/UTC", widths: [1440] },
];

const browser = await chromium.launch({ headless: true });
try {
  await seed();
  for (const c of cases) {
    await putSettings({
      timezone: c.saved,
      user_display_name: "Alex",
      user_initial: "A",
      onboarding_completed_at: new Date().toISOString(),
    });
    for (const width of c.widths) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        timezoneId: c.browserTz,
        locale: "en-US",
      });
      const page = await context.newPage();
      await openTimezoneSettings(page, width);
      await shot(page, `settings-${c.id}-${width}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await seed();
  await putSettings({
    timezone: "Europe/Paris",
    user_display_name: "Alex",
    user_initial: "A",
    onboarding_completed_at: new Date().toISOString(),
  });
}
console.log("done", phase);
