#!/usr/bin/env node
/**
 * Capture AC12 screenshots against a clean seeded demo DB on the live ports.
 * Does not create test items. Run: pnpm seed && pnpm capture:ac12
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.env.RELAY_WEB ?? "http://127.0.0.1:7421";
const ART = "/opt/cursor/artifacts";

async function main() {
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  for (const mode of ["light", "dark"]) {
    await page.goto(WEB);
    await page.evaluate((m) => {
      localStorage.setItem("relay.theme", m);
      document.documentElement.classList.toggle("dark", m === "dark");
    }, mode);
    await page.reload();
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: /Atención/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: resolve(ART, `ac12-atencion-${mode}.png`),
    });

    await page.getByRole("button", { name: /Con agentes/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: resolve(ART, `ac12-con-agentes-${mode}.png`),
    });

    await page.getByRole("button", { name: /Atención/ }).click();
    await page
      .getByRole("group", { name: "Te necesita" })
      .getByText("Elegir titular")
      .first()
      .click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(ART, `ac12-detail-needs-you-${mode}.png`),
    });

    await page.getByRole("button", { name: /Lo que ve el agente/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(ART, `ac12-detail-contexto-${mode}.png`),
    });
    await page.getByRole("button", { name: /Volver/ }).click();
  }

  await browser.close();
  console.info(`AC12 screenshots written to ${ART}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
