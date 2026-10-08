import { expect, test, type Page } from "@playwright/test";
import { waitInboxView } from "./helpers";

const API = "http://127.0.0.1:7430";
const SLA_MS = 5000;

/** Thu 8 Oct 2026, 10:00 Europe/Paris — clock from ui-spec §7 / V03-L29. */
const FAKE_NOW_ISO = "2026-10-08T08:00:00.000Z";

async function mcp(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
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
  const json = (await res.json()) as {
    result?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.result ?? {};
}

async function openLocale(
  page: Page,
  locale: "en" | "fr" | "es",
  width: number,
) {
  await page.clock.install({ time: new Date(FAKE_NOW_ISO) });
  await page.addInitScript((loc) => {
    localStorage.setItem("relay.locale", loc);
  }, locale);
  await page.setViewportSize({
    width,
    height: width === 390 ? 844 : 900,
  });
  await page.goto("/attention");
  await waitInboxView(page, "attention");
}

async function seedL29Item(): Promise<{ id: string; title: string }> {
  const title = `Row times L29 ${Date.now()}`;
  const created = (await mcp("items_create", { title })) as {
    item: { id: string; title: string };
  };
  await mcp("items_delegate", {
    id: created.item.id,
    agent_id: "agent-code",
  });
  await mcp("items_ask_user", {
    id: created.item.id,
    reason: "Publish A or B?",
  });
  // due tomorrow 13:12 Paris, reminder today 23:12 Paris
  await mcp("items_update", {
    id: created.item.id,
    due_at: "2026-10-09T11:12:00.000Z",
    reminder_at: "2026-10-08T21:12:00.000Z",
    reminder_intent: "Review the draft before recording",
  });
  return created.item;
}

test.describe("V03-L29–L33 row due/reminder", () => {
  test("V03-L29 ES: Mañana 13:12 then Bell + Hoy 23:12 + aria", async ({
    page,
  }) => {
    const item = await seedL29Item();
    await openLocale(page, "es", 1440);
    const row = page.getByRole("option", { name: new RegExp(item.title) });
    await expect(row).toBeVisible({ timeout: SLA_MS });
    await expect(row.locator(".due-chip")).toHaveText("Mañana 13:12");
    await expect(row.locator(".reminder-text")).toHaveText("Hoy 23:12");
    await expect(row.locator(".reminder-bell")).toBeVisible();
    await expect(row.locator(".reminder-bell")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const aria = (await row.getAttribute("aria-label")) ?? "";
    expect(aria).toMatch(/Vence:\s*mañana/i);
    expect(aria).toMatch(/Aviso:\s*hoy/i);
  });

  test("V03-L30 reminder chip never bare time", async ({ page }) => {
    const item = await seedL29Item();
    await openLocale(page, "es", 1440);
    const row = page.getByRole("option", { name: new RegExp(item.title) });
    const rem = row.locator(".reminder-text");
    await expect(rem).toBeVisible();
    const text = (await rem.textContent()) ?? "";
    expect(text.trim()).not.toMatch(/^\d{1,2}:\d{2}$/);
    expect(text).toMatch(/Hoy|Mañana|[A-Za-záéíóúñ]+|\d/);
  });
});

test.describe("V03-R13 .rel never clips", () => {
  for (const locale of ["en", "fr", "es"] as const) {
    for (const width of [1440, 768, 390] as const) {
      test(`${locale} @ ${width}: every .rel scrollWidth <= clientWidth`, async ({
        page,
      }) => {
        await openLocale(page, locale, width);
        if (locale === "fr") {
          await page.evaluate(() => {
            for (const el of document.querySelectorAll(".rel")) {
              el.textContent = "il y a 10 min";
            }
          });
        }
        const clipped = await page.evaluate(() => {
          const bad: string[] = [];
          for (const el of document.querySelectorAll(".rel")) {
            const html = el as HTMLElement;
            if (html.scrollWidth > html.clientWidth + 1) {
              bad.push(
                `${html.textContent} sw=${html.scrollWidth} cw=${html.clientWidth}`,
              );
            }
          }
          return bad;
        });
        expect(clipped, clipped.join("; ")).toEqual([]);
        if (width >= 768) {
          // getComputedStyle resolves `13ch` to px (~91px for Plex Mono 12).
          const minPx = await page.locator(".rel").first().evaluate((el) => {
            const raw = getComputedStyle(el).minWidth;
            return Number.parseFloat(raw);
          });
          expect(minPx).toBeGreaterThanOrEqual(80);
        }
        if (width === 390) {
          const box = await page.locator(".rel").first().boundingBox();
          const row = await page.getByRole("option").first().boundingBox();
          expect(box && row).toBeTruthy();
          if (box && row) {
            expect(box.x + box.width).toBeGreaterThan(row.x + row.width * 0.55);
          }
        }
      });
    }
  }
});
