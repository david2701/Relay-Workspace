/**
 * EN/FR/ES × Attention / All / All+detail(+picker) × 1440/768/390
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const WEB = "http://127.0.0.1:7431";
const OUT = "/opt/cursor/artifacts/screenshots/i18n";
mkdirSync(OUT, { recursive: true });

const WIDTHS = [1440, 768, 390];
const LOCALES = [
  { code: "en", tag: "en-US" },
  { code: "fr", tag: "fr-FR" },
  { code: "es", tag: "es-ES" },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const { code, tag } of LOCALES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        locale: tag,
        viewport: { width, height: width === 390 ? 844 : 900 },
        storageState: {
          cookies: [],
          origins: [
            {
              origin: WEB,
              localStorage: [{ name: "relay.locale", value: code }],
            },
          ],
        },
      });
      const page = await context.newPage();

      await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-inbox-view="attention"]');
      await page.screenshot({
        path: resolve(OUT, `${code}-attention-${width}.png`),
      });

      await page.goto(`${WEB}/all`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-inbox-view="all"]');
      await page.screenshot({
        path: resolve(OUT, `${code}-all-${width}.png`),
      });

      const itemId = await page.evaluate(() => {
        const el = document.querySelector('[role="option"]');
        const id = el?.id ?? "";
        return id.startsWith("row-") ? id.slice(4) : "";
      });
      if (!itemId) throw new Error(`no item id for ${code}@${width}`);
      await page.goto(`${WEB}/all?item=${itemId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.locator(".dtp button").first().click({ force: true, timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({
        path: resolve(OUT, `${code}-detail-picker-${width}.png`),
      });

      await context.close();
      console.log(`OK ${code} @ ${width}`);
    }
  }
  await browser.close();
  console.log(`Wrote screenshots under ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
