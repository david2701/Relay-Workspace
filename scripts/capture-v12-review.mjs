#!/usr/bin/env node
/**
 * Capture review screenshots for PR QA:
 * - Atención / Todo 10k light+dark (after data loaded — never · 0 / skeleton)
 * - DatePicker open at 1440/768/390 light+dark
 * - Filters + note markdown light+dark (if reachable)
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const WEB = process.env.RELAY_WEB ?? "http://127.0.0.1:7421";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem("relay.theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.dataset.theme = t;
  }, theme);
}

async function waitListReady(page) {
  await page.getByRole("option").first().waitFor({ state: "visible", timeout: 60_000 });
  // Header must not show · 0 while loading.
  await page.waitForFunction(() => {
    const count = document.querySelector(".list-head-count");
    if (!count) return false;
    const text = count.textContent?.trim() ?? "";
    return text.length > 0 && !/^(·\s*)?0$/.test(text);
  }, { timeout: 30_000 });
  await page.waitForTimeout(200);
}

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.info("wrote", path);
}

async function openPicker(page) {
  await page.locator('[data-inbox-view="all"]').waitFor();
  await waitListReady(page);
  const opt = page.getByRole("option").first();
  const id = (await opt.getAttribute("id"))?.replace(/^row-/, "");
  await page.goto(`${WEB}/all?item=${id}`);
  await page.locator('[data-inbox-view="all"]').waitFor();
  await waitListReady(page);
  await page.locator(`#row-${id}`).waitFor({ state: "visible" });
  // Ensure header count is real (not 0) before opening picker.
  await page.waitForFunction(() => {
    const t = document.querySelector(".list-head-count")?.textContent ?? "";
    return /\d/.test(t) && !/·\s*0\b/.test(t);
  }, { timeout: 30_000 });
  const trigger = page.locator(".detail-zone .dtp-trigger").first();
  await trigger.waitFor({ state: "visible" });
  await trigger.click({ force: true });
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  // Wait a paint so opacity/position settle.
  await page.waitForTimeout(150);
  return dialog;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60_000);

  for (const theme of ["light", "dark"]) {
    await page.goto(WEB, { waitUntil: "domcontentloaded" });
    await setTheme(page, theme);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Atención/ }).click();
    await page.locator('[data-inbox-view="attention"]').waitFor();
    await waitListReady(page);
    await shot(page, `atencion-10k-${theme}`);

    await page.getByRole("button", { name: /^Todo/ }).click();
    await page.locator('[data-inbox-view="all"]').waitFor();
    await waitListReady(page);
    await shot(page, `todo-10k-${theme}`);

    const search = page.getByRole("searchbox");
    await search.fill("demo");
    await page.waitForTimeout(500);
    await waitListReady(page);
    await shot(page, `filters-active-${theme}`);
    await search.fill("");

    await openPicker(page);
    await shot(page, `datepicker-open-${theme}`);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Notas/ }).click();
    await page.waitForTimeout(500);
    const note = page.locator("article, .note-card, [data-note-id]").first();
    if ((await note.count()) > 0) {
      await note.click({ force: true });
      await page.waitForTimeout(400);
      await shot(page, `note-markdown-${theme}`);
    }
  }

  for (const width of [1440, 768, 390]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB}/all`, { waitUntil: "domcontentloaded" });
      await setTheme(page, theme);
      await page.reload({ waitUntil: "domcontentloaded" });
      await openPicker(page);
      await shot(page, `datepicker-${width}-${theme}`);
      await page.keyboard.press("Escape");
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
