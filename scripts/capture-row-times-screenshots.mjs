/**
 * §7 captures: app-attention-row-times_* + app-attention-rel_* + main views.
 * Requires API :7430 and web :7431 with cleaned seed.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const API = "http://127.0.0.1:7430";
const WEB = "http://127.0.0.1:7431";
const OUT = "/opt/cursor/artifacts/screenshots";
const I18N = resolve(OUT, "i18n");
mkdirSync(I18N, { recursive: true });
mkdirSync(OUT, { recursive: true });

const FAKE_NOW = "2026-10-08T08:00:00.000Z";
const WIDTHS = [1440, 768, 390];
const LOCALES = [
  { code: "en", tag: "en-US" },
  { code: "fr", tag: "fr-FR" },
  { code: "es", tag: "es-ES" },
];

async function mcp(name, args) {
  const res = await fetch(`${API}/mcp/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Actor": "agent-code",
      "X-Relay-Source": "mcp",
    },
    body: JSON.stringify({
      name,
      arguments: { ...args, actor: { id: "agent-code", type: "agent" } },
    }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.result ?? {};
}

async function seedRowTimesItem() {
  const created = await mcp("items_create", {
    title: `QA row times ${Date.now()}`,
  });
  const id = created.item.id;
  await mcp("items_delegate", { id, agent_id: "agent-code" });
  await mcp("items_ask_user", { id, reason: "Publish A or B?" });
  await mcp("items_update", {
    id,
    due_at: "2026-10-09T11:12:00.000Z",
    reminder_at: "2026-10-08T21:12:00.000Z",
    reminder_intent: "Review the draft before recording",
  });
  return { id, title: created.item.title };
}

async function main() {
  const item = await seedRowTimesItem();
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
      await page.clock.install({ time: new Date(FAKE_NOW) });

      await page.goto(`${WEB}/attention`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-inbox-view="attention"]');

      // Main attention view
      await page.screenshot({
        path: resolve(I18N, `${code}-attention-${width}.png`),
      });

      // Row-times crop (1440 + 390)
      if (width === 1440 || width === 390) {
        const row = page.getByRole("option", { name: new RegExp(item.title) });
        await row.waitFor({ state: "visible", timeout: 5000 });
        await row.screenshot({
          path: resolve(OUT, `app-attention-row-times_${code}_${width}.png`),
        });
      }

      // Rel crop at 390 with FR long string
      if (width === 390) {
        if (code === "fr") {
          await page.evaluate(() => {
            for (const el of document.querySelectorAll(".rel")) {
              el.textContent = "il y a 10 min";
            }
          });
        }
        await page.locator(".item-list").screenshot({
          path: resolve(OUT, `app-attention-rel_${code}_390.png`),
        });
      }

      // Upcoming (Today-ish) + All
      await page.goto(`${WEB}/upcoming`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-inbox-view="upcoming"]');
      await page.screenshot({
        path: resolve(I18N, `${code}-upcoming-${width}.png`),
      });

      await page.goto(`${WEB}/all`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-inbox-view="all"]');
      await page.screenshot({
        path: resolve(I18N, `${code}-all-${width}.png`),
      });

      const itemId = await page.evaluate(() => {
        const el = document.querySelector('[role="option"]');
        const id = el?.id ?? "";
        return id.startsWith("row-") ? id.slice(4) : "";
      });
      if (itemId) {
        await page.goto(`${WEB}/all?item=${itemId}`, {
          waitUntil: "networkidle",
        });
        await page.waitForTimeout(400);
        await page
          .locator(".dtp button")
          .first()
          .click({ force: true, timeout: 3000 })
          .catch(() => {});
        await page.waitForTimeout(350);
        await page.screenshot({
          path: resolve(I18N, `${code}-detail-picker-${width}.png`),
        });
      }

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
