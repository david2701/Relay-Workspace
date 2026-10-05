#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
/**
 * Capture Hechos after Atención→Hechos at 300ms and 2800ms for BUG-2 evidence.
 */
import { chromium } from "@playwright/test";

const WEB = process.env.RELAY_WEB ?? "http://127.0.0.1:7421";
const ART = "/opt/cursor/artifacts";

async function main() {
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(WEB);
  await page.getByRole("button", { name: /Atención/ }).click();
  await page.locator('[data-inbox-view="attention"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);

  const clickAt = Date.now();
  await page.getByRole("button", { name: /^Hechos$/ }).click();

  await page.waitForTimeout(Math.max(0, 300 - (Date.now() - clickAt)));
  await page.screenshot({
    path: resolve(ART, "hechos_after_switch_300ms.png"),
    fullPage: false,
  });
  const earlyRows = await page.getByRole("option").evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );
  const earlyLabels = await page.locator(".section-label").allTextContents();

  await page.waitForTimeout(Math.max(0, 2800 - (Date.now() - clickAt)));
  await page.screenshot({
    path: resolve(ART, "hechos_after_switch_2800ms.png"),
    fullPage: false,
  });
  const lateRows = await page.getByRole("option").evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );
  const lateLabels = await page.locator(".section-label").allTextContents();

  const report = {
    earlyMs: 300,
    lateMs: 2800,
    earlyLabels,
    lateLabels,
    earlyRows,
    lateRows,
    earlyNonTerminal: earlyRows.filter(
      (l) => !/Hecho|Cancelado/.test(l) && l.length > 0,
    ),
    lateNonTerminal: lateRows.filter(
      (l) => !/Hecho|Cancelado/.test(l) && l.length > 0,
    ),
  };
  console.info(JSON.stringify(report, null, 2));
  if (report.earlyNonTerminal.length > 0 || report.lateNonTerminal.length > 0) {
    console.error("FAIL: non-terminal rows in Hechos after switch");
    process.exit(1);
  }
  console.info("PASS: Hechos switch samples are terminal-only");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
