/**
 * Screenshots for v0.3 onboarding card + Settings (EN/FR/ES × 1440/390, light).
 * Requires API :7430 and web :7431.
 *
 * Usage: node scripts/capture-onboarding-settings.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/onboarding-settings");
const API = process.env.RELAY_API_URL ?? "http://127.0.0.1:7430";
const WEB = process.env.RELAY_WEB_URL ?? "http://127.0.0.1:7431";

const LOCALES = [
  { code: "en", name: "Ana Martin", settingsName: "Ana Martin" },
  { code: "fr", name: "Camille Martin", settingsName: "Camille Martin" },
  { code: "es", name: "Ana Martín", settingsName: "Ana Martín" },
];

const VIEWPORTS = [
  { w: 1440, h: 900, tag: "1440" },
  { w: 390, h: 844, tag: "390" },
];

mkdirSync(outDir, { recursive: true });

async function prepare(variant) {
  const res = await fetch(`${API}/api/store/prepare-onboarding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant, locale: "en" }),
  });
  if (!res.ok) throw new Error(`prepare-onboarding failed: ${await res.text()}`);
}

async function completeOnboarding(name) {
  const res = await fetch(`${API}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timezone: "Europe/Paris",
      user_display_name: name,
      user_initial: name.trim().charAt(0).toLocaleUpperCase(),
      onboarding_completed_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`settings failed: ${await res.text()}`);
}

const browser = await chromium.launch({ headless: true });

for (const loc of LOCALES) {
  for (const vp of VIEWPORTS) {
    await prepare("empty");
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      colorScheme: "light",
      locale: loc.code === "en" ? "en-US" : loc.code === "fr" ? "fr-FR" : "es-ES",
      timezoneId: "Europe/Paris",
    });
    const page = await context.newPage();
    await page.addInitScript((code) => {
      localStorage.setItem("relay.locale", code);
      localStorage.setItem("relay.theme", "light");
    }, loc.code);
    await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
    const card = page.locator(".onboarding-card");
    await card.waitFor({ state: "visible" });
    await page.locator("#onboarding-name").fill(loc.name);
    // Collapse timezone picker so the rest of the card is visible.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const cardPath = resolve(
      outDir,
      `onboarding-card_${loc.code}_${vp.tag}.png`,
    );
    await page.screenshot({ path: cardPath, fullPage: false });
    console.info("wrote", cardPath);
    await context.close();
  }
}

for (const loc of LOCALES) {
  for (const vp of VIEWPORTS) {
    await prepare("empty");
    await completeOnboarding(loc.settingsName);
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      colorScheme: "light",
      locale: loc.code === "en" ? "en-US" : loc.code === "fr" ? "fr-FR" : "es-ES",
      timezoneId: "Europe/Paris",
    });
    const page = await context.newPage();
    await page.addInitScript((code) => {
      localStorage.setItem("relay.locale", code);
      localStorage.setItem("relay.theme", "light");
    }, loc.code);
    await page.goto(`${WEB}/attention?settings=profile`, {
      waitUntil: "networkidle",
    });
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    const nameInput = dialog.locator("input").first();
    await expectVisible(nameInput);
    const value = await nameInput.inputValue();
    if (!value) {
      await nameInput.fill(loc.settingsName);
      await nameInput.blur();
      await page.waitForTimeout(700);
    }
    const settingsPath = resolve(
      outDir,
      `settings-profile_${loc.code}_${vp.tag}.png`,
    );
    await page.screenshot({ path: settingsPath, fullPage: false });
    console.info("wrote", settingsPath);
    await context.close();
  }
}

await browser.close();
console.info("done →", outDir);

async function expectVisible(locator) {
  await locator.waitFor({ state: "visible" });
}
