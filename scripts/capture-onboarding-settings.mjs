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
    const mark = dialog.locator(".settings-initial-wrap .actor-mark");
    await mark.waitFor({ state: "visible" });
    const markPath = resolve(
      outDir,
      `settings-mark_${loc.code}_${vp.tag}.png`,
    );
    await mark.screenshot({ path: markPath });
    console.info("wrote", markPath);
    await context.close();
  }
}

// Side-by-side close-up: onboarding mark (Camille) vs Settings mark (Camille).
{
  await prepare("empty");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("relay.locale", "fr");
    localStorage.setItem("relay.theme", "light");
  });
  await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
  const card = page.locator(".onboarding-card");
  await card.waitFor({ state: "visible" });
  await page.locator("#onboarding-name").fill("Camille Martin");
  await page.waitForTimeout(150);
  const onbMark = card.locator(".actor-mark");
  const onbPath = resolve(outDir, "compare-mark_onboarding_fr.png");
  await onbMark.screenshot({ path: onbPath });
  console.info("wrote", onbPath);
  await context.close();

  await prepare("empty");
  await completeOnboarding("Camille Martin");
  const context2 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const page2 = await context2.newPage();
  await page2.addInitScript(() => {
    localStorage.setItem("relay.locale", "fr");
    localStorage.setItem("relay.theme", "light");
  });
  await page2.goto(`${WEB}/attention?settings=profile`, {
    waitUntil: "networkidle",
  });
  const dialog = page2.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  const setMark = dialog.locator(".settings-initial-wrap .actor-mark");
  const setPath = resolve(outDir, "compare-mark_settings_fr.png");
  await setMark.screenshot({ path: setPath });
  console.info("wrote", setPath);
  await context2.close();
}

await browser.close();
console.info("done →", outDir);

async function expectVisible(locator) {
  await locator.waitFor({ state: "visible" });
}
