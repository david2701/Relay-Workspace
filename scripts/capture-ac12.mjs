#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * Capture AC12 screenshots against a clean seeded demo DB on the live ports.
 * Does not create test items. Run: pnpm seed && pnpm capture:ac12
 */
import { chromium } from "@playwright/test";

const WEB = process.env.RELAY_WEB ?? "http://127.0.0.1:7421";
const ART = "/opt/cursor/artifacts";

async function applyTheme(page, mode) {
  const label = mode === "dark" ? "Oscuro" : "Claro";
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction(
    (wantDark) => document.documentElement.classList.contains("dark") === wantDark,
    mode === "dark",
    { timeout: 3000 },
  );
  const pressed = page.getByRole("button", { name: label, exact: true });
  await pressed.waitFor({ state: "visible" });
  const isPressed = await pressed.getAttribute("aria-pressed");
  if (isPressed !== "true") {
    throw new Error(`Theme control did not select ${label} (aria-pressed=${isPressed})`);
  }
  if (mode === "dark") {
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    if (!hasDark) {
      throw new Error("Dark capture guard: <html> lacks class 'dark'");
    }
  } else {
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    if (hasDark) {
      throw new Error("Light capture guard: <html> still has class 'dark'");
    }
  }
}

function assertPairDiffers(lightPath, darkPath) {
  const light = readFileSync(lightPath);
  const dark = readFileSync(darkPath);
  const lightHash = createHash("md5").update(light).digest("hex");
  const darkHash = createHash("md5").update(dark).digest("hex");
  if (lightHash === darkHash) {
    throw new Error(
      `Light/dark screenshots are byte-identical: ${lightPath} and ${darkPath} (md5=${lightHash})`,
    );
  }
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  const pairs = [
    "ac12-atencion",
    "ac12-sugerido",
    "ac12-con-agentes",
    "ac12-detail-needs-you",
    "ac12-detail-contexto",
  ];

  for (const mode of ["light", "dark"]) {
    await page.goto(WEB, { waitUntil: "networkidle" });
    await applyTheme(page, mode);
    await page.waitForTimeout(400);

    await page.getByRole("button", { name: /Atención/ }).click();
    await page.waitForTimeout(500);
    const sugHead = page.locator(".suggested-head");
    if (await sugHead.count()) {
      const collapsed = await page.locator(".suggested-row").count();
      if (collapsed === 0) await sugHead.click();
    }
    await page.waitForTimeout(300);
    if (mode === "dark") {
      const hasDark = await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      );
      if (!hasDark) throw new Error("Dark guard failed before Atención shot");
    }
    await page.screenshot({
      path: resolve(ART, `ac12-atencion-${mode}.png`),
    });
    await page.screenshot({
      path: resolve(ART, `ac12-sugerido-${mode}.png`),
    });

    await page.getByRole("button", { name: /Con agentes/ }).click();
    await expectInboxView(page, "agent_wip");
    await page.waitForTimeout(400);
    if (mode === "dark") {
      const hasDark = await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      );
      if (!hasDark) throw new Error("Dark guard failed before Con agentes shot");
    }
    await page.screenshot({
      path: resolve(ART, `ac12-con-agentes-${mode}.png`),
    });

    await page.getByRole("button", { name: /Atención/ }).click();
    await expectInboxView(page, "attention");
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

  for (const base of pairs) {
    assertPairDiffers(
      resolve(ART, `${base}-light.png`),
      resolve(ART, `${base}-dark.png`),
    );
  }

  await browser.close();
  console.info(`AC12 screenshots written to ${ART}`);
}

/** Wait until the list reflects the fetched inbox view (avoids stale cross-view rows). */
async function expectInboxView(page, view) {
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector("[data-inbox-view]");
      return el?.getAttribute("data-inbox-view") === expected;
    },
    view,
    { timeout: 5000 },
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
