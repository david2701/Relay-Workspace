/**
 * Screenshots for demo block:
 * - Attention after demo (EN) at 1440 and 390 (light)
 * - Preloaded onboarding card (FR) at 1440 and 390 (light)
 *
 * Expects API :7420 and web :7421 against a demo-seeded store, OR set
 * RELAY_API_URL / RELAY_WEB_URL (defaults match `pnpm demo`).
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/demo");
const API = process.env.RELAY_API_URL ?? "http://127.0.0.1:7420";
const WEB = process.env.RELAY_WEB_URL ?? "http://127.0.0.1:7421";

mkdirSync(outDir, { recursive: true });

async function preparePreloaded() {
  const res = await fetch(`${API}/api/store/prepare-onboarding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant: "preloaded", locale: "en" }),
  });
  if (!res.ok) throw new Error(`prepare-onboarding: ${await res.text()}`);
}

async function completeOnboardingEn() {
  const res = await fetch(`${API}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timezone: "Europe/Paris",
      user_display_name: "Alex",
      user_initial: "A",
      onboarding_completed_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`settings: ${await res.text()}`);
}

const browser = await chromium.launch({ headless: true });

// FR preloaded card
for (const vp of [
  { w: 1440, h: 900, tag: "1440" },
  { w: 390, h: 844, tag: "390" },
]) {
  await preparePreloaded();
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
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
  await page.locator(".onboarding-card").waitFor({ state: "visible" });
  await page.locator("#onboarding-name").fill("Camille");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const path = resolve(outDir, `demo-onboarding-preloaded_fr_${vp.tag}.png`);
  await page.screenshot({ path, fullPage: false });
  console.info("wrote", path);
  await context.close();
}

// EN Attention after completing demo onboarding (no reload)
for (const vp of [
  { w: 1440, h: 900, tag: "1440" },
  { w: 390, h: 844, tag: "390" },
]) {
  await preparePreloaded();
  await completeOnboardingEn();
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "Europe/Paris",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("relay.locale", "en");
    localStorage.setItem("relay.theme", "light");
  });
  await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
  await page.locator(".onboarding-card").waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(500);
  const path = resolve(outDir, `demo-attention_en_${vp.tag}.png`);
  await page.screenshot({ path, fullPage: false });
  console.info("wrote", path);
  await context.close();
}

await browser.close();
console.info("demo screenshots done →", outDir);
