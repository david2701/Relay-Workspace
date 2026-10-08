#!/usr/bin/env node
/**
 * Capture review screenshots for PR QA:
 * - Atención / Todo 10k light+dark
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
    document.documentElement.dataset.theme = t;
    localStorage.setItem("relay.theme", t);
  }, theme);
}

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.info("wrote", path);
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
    await page.getByRole("option").first().waitFor({ state: "visible" });
    await shot(page, `atencion-10k-${theme}`);

    await page.getByRole("button", { name: /^Todo/ }).click();
    await page.locator('[data-inbox-view="all"]').waitFor();
    await page.getByRole("option").first().waitFor({ state: "visible" });
    await shot(page, `todo-10k-${theme}`);

    // Filters
    const search = page.getByRole("searchbox");
    await search.fill("demo");
    await page.waitForTimeout(400);
    await shot(page, `filters-active-${theme}`);
    await search.fill("");

    // DatePicker at 1440
    const opt = page.getByRole("option").first();
    const id = (await opt.getAttribute("id"))?.replace(/^row-/, "");
    await page.goto(`${WEB}/all?item=${id}`);
    await page.locator('[data-inbox-view="all"]').waitFor();
    await page.locator(".detail-zone .dtp-trigger").first().click();
    await page.getByRole("dialog").waitFor();
    await shot(page, `datepicker-open-${theme}`);
    await page.keyboard.press("Escape");

    // Note markdown if notes view has rows
    await page.getByRole("button", { name: /Notas/ }).click();
    await page.waitForTimeout(500);
    const note = page.locator("article, .note-card, [data-note-id]").first();
    if ((await note.count()) > 0) {
      await note.click({ force: true });
      await page.waitForTimeout(400);
      await shot(page, `note-markdown-${theme}`);
    }
  }

  // Responsive datepicker widths
  for (const width of [1440, 768, 390]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB}/all`, { waitUntil: "domcontentloaded" });
      await setTheme(page, theme);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('[data-inbox-view="all"]').waitFor();
      const opt = page.getByRole("option").first();
      await opt.waitFor({ state: "visible" });
      const id = (await opt.getAttribute("id"))?.replace(/^row-/, "");
      await page.goto(`${WEB}/all?item=${id}`);
      await page.locator(".detail-zone .dtp-trigger").first().waitFor({
        state: "visible",
      });
      await page.locator(".detail-zone .dtp-trigger").first().click({ force: true });
      await page.getByRole("dialog").waitFor();
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
