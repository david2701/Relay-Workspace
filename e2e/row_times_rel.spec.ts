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
  opts?: { pseudoXa?: boolean },
) {
  await page.clock.install({ time: new Date(FAKE_NOW_ISO) });
  await page.addInitScript((loc) => {
    localStorage.setItem("relay.locale", loc);
  }, locale);
  await page.setViewportSize({
    width,
    height: width <= 390 ? 844 : 900,
  });
  const qs = opts?.pseudoXa ? "?locale=en-XA" : "";
  await page.goto(`/attention${qs}`);
  await waitInboxView(page, "attention");
}

async function hideDetailOverlay(page: Page) {
  // Pre-existing §R: empty detail covers the list at <768; hide for list assertions.
  await page.locator(".detail-zone").evaluate((el) => {
    el.style.setProperty("display", "none", "important");
  });
}

async function seedItem(fields: {
  title: string;
  due_at?: string | null;
  reminder_at?: string | null;
  reminder_intent?: string;
  ask?: boolean;
}): Promise<{ id: string; title: string }> {
  const created = (await mcp("items_create", { title: fields.title })) as {
    item: { id: string; title: string };
  };
  await mcp("items_delegate", {
    id: created.item.id,
    agent_id: "agent-code",
  });
  if (fields.ask !== false) {
    await mcp("items_ask_user", {
      id: created.item.id,
      reason: "Publish A or B?",
    });
  }
  const patch: Record<string, unknown> = { id: created.item.id };
  if (fields.due_at !== undefined) patch.due_at = fields.due_at;
  if (fields.reminder_at !== undefined) patch.reminder_at = fields.reminder_at;
  if (fields.reminder_intent !== undefined) {
    patch.reminder_intent = fields.reminder_intent;
  }
  if (
    fields.due_at !== undefined ||
    fields.reminder_at !== undefined ||
    fields.reminder_intent !== undefined
  ) {
    await mcp("items_update", patch);
  }
  return created.item;
}

async function seedL29Item(): Promise<{ id: string; title: string }> {
  return seedItem({
    title: `Row times L29 ${Date.now()}`,
    due_at: "2026-10-09T11:12:00.000Z",
    reminder_at: "2026-10-08T21:12:00.000Z",
    reminder_intent: "Review the draft before recording",
  });
}

function rgbOf(cssColor: string): string {
  // normalize "rgb(a, b, c)" / "rgba(...)" for compare
  return cssColor.replace(/\s+/g, "");
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

  test("V03-L30: no bare reminder time; due-only / reminder-only shapes", async ({
    page,
  }) => {
    const both = await seedL29Item();
    const dueOnly = await seedItem({
      title: `Due only ${Date.now()}`,
      due_at: "2026-10-09T11:12:00.000Z",
      reminder_at: null,
    });
    const remOnly = await seedItem({
      title: `Rem only ${Date.now()}`,
      due_at: null,
      reminder_at: "2026-10-08T21:12:00.000Z",
      reminder_intent: "Check staging",
    });

    await openLocale(page, "es", 1440);

    const bothRow = page.getByRole("option", { name: new RegExp(both.title) });
    const remText = (await bothRow.locator(".reminder-text").textContent()) ?? "";
    expect(remText.trim()).not.toMatch(/^\d{1,2}:\d{2}$/);
    expect(remText).toMatch(/Hoy|Mañana|[A-Za-záéíóúñ]+/);

    const dueRow = page.getByRole("option", {
      name: new RegExp(dueOnly.title),
    });
    await expect(dueRow.locator(".due-chip")).toBeVisible();
    await expect(dueRow.locator(".reminder-bell")).toHaveCount(0);

    const remRow = page.getByRole("option", {
      name: new RegExp(remOnly.title),
    });
    await expect(remRow.locator(".reminder-bell")).toBeVisible();
    await expect(remRow.locator(".reminder-text")).toHaveText(/Hoy|Mañana/);
    await expect(remRow.locator(".due-chip")).toHaveCount(0);
  });

  test("V03-L31 colors: overdue crit, soon warn, reminder muted (light+dark)", async ({
    browser,
  }) => {
    const overdue = await seedItem({
      title: `Overdue color ${Date.now()}`,
      due_at: "2026-10-07T12:00:00.000Z",
      reminder_at: null,
    });
    const soon = await seedItem({
      title: `Soon warn ${Date.now()}`,
      // today 11:00 Paris = 1h after fake now 10:00 → < 4h → warn
      due_at: "2026-10-08T09:00:00.000Z",
      reminder_at: null,
    });
    const withRem = await seedItem({
      title: `Rem muted ${Date.now()}`,
      due_at: "2026-10-09T11:12:00.000Z",
      reminder_at: "2026-10-08T21:12:00.000Z",
    });

    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        storageState: {
          cookies: [],
          origins: [
            {
              origin: "http://127.0.0.1:7431",
              localStorage: [
                { name: "relay.locale", value: "es" },
                { name: "relay.theme", value: theme },
              ],
            },
          ],
        },
      });
      const page = await context.newPage();
      await page.clock.install({ time: new Date(FAKE_NOW_ISO) });
      await page.goto("/attention");
      await waitInboxView(page, "attention");
      if (theme === "dark") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      } else {
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      }

      const resolveTok = async (tok: string) =>
        page.evaluate((t) => {
          const probe = document.createElement("span");
          probe.style.color = t;
          document.body.appendChild(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        }, tok);

      const tokens = await page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        return {
          crit: s.getPropertyValue("--crit").trim(),
          warn: s.getPropertyValue("--warn").trim(),
          muted: s.getPropertyValue("--ink-muted").trim(),
        };
      });
      const [crit, warn, muted] = await Promise.all([
        resolveTok(tokens.crit),
        resolveTok(tokens.warn),
        resolveTok(tokens.muted),
      ]);

      const overdueRow = page.getByRole("option", {
        name: new RegExp(overdue.title),
      });
      const soonRow = page.getByRole("option", {
        name: new RegExp(soon.title),
      });
      const remRow = page.getByRole("option", {
        name: new RegExp(withRem.title),
      });

      const overdueColor = await overdueRow
        .locator(".due-chip")
        .evaluate((el) => getComputedStyle(el).color);
      const soonColor = await soonRow
        .locator(".due-chip")
        .evaluate((el) => getComputedStyle(el).color);
      const remColor = await remRow
        .locator(".reminder-chip")
        .evaluate((el) => getComputedStyle(el).color);
      const bellColor = await remRow
        .locator(".reminder-bell")
        .evaluate((el) => getComputedStyle(el).color);

      expect(rgbOf(overdueColor), `overdue ${theme}`).toBe(rgbOf(crit));
      expect(rgbOf(soonColor), `soon ${theme}`).toBe(rgbOf(warn));
      expect(rgbOf(remColor), `reminder ${theme}`).toBe(rgbOf(muted));
      expect(rgbOf(bellColor), `bell ${theme}`).toBe(rgbOf(muted));
      await context.close();
    }
  });

  test("V03-L32: list 624px → bell alone with row.reminder.label; 768px → day+time", async ({
    page,
  }) => {
    const item = await seedL29Item();
    await openLocale(page, "es", 1024);
    // Spec: list at 624px (viewport ~1024). Force container width for CQ.
    await page.locator(".item-list").evaluate((el) => {
      (el as HTMLElement).style.width = "624px";
      (el as HTMLElement).style.maxWidth = "624px";
    });
    const row = page.getByRole("option", { name: new RegExp(item.title) });
    await expect(row).toBeVisible({ timeout: SLA_MS });
    await expect(row.locator(".due-chip")).toBeVisible();
    await expect(row.locator(".due-chip")).toHaveText(/Mañana/);
    // Reminder text collapsed; bell remains
    await expect(row.locator(".reminder-bell")).toBeVisible();
    await expect(row.locator(".reminder-text")).toBeHidden();
    const chip = row.locator(".reminder-chip");
    const aria = (await chip.getAttribute("aria-label")) ?? "";
    expect(aria).toMatch(/^Aviso:\s*hoy/i);
    const title = (await chip.getAttribute("title")) ?? "";
    expect(title.length).toBeGreaterThan(0);

    // Widen list to 768px → day + time visible again
    await page.locator(".item-list").evaluate((el) => {
      (el as HTMLElement).style.width = "768px";
      (el as HTMLElement).style.maxWidth = "768px";
    });
    await expect(row.locator(".reminder-text")).toBeVisible();
    await expect(row.locator(".reminder-text")).toHaveText("Hoy 23:12");
  });

  test("V03-L33: 390 en/fr/es/en-XA chips unclipped with day", async ({
    page,
  }) => {
    const item = await seedL29Item();
    const locales: Array<{
      code: "en" | "fr" | "es";
      pseudoXa?: boolean;
      label: string;
    }> = [
      { code: "en", label: "en" },
      { code: "fr", label: "fr" },
      { code: "es", label: "es" },
      { code: "en", pseudoXa: true, label: "en-XA" },
    ];

    for (const loc of locales) {
      await openLocale(page, loc.code, 390, { pseudoXa: loc.pseudoXa });
      await hideDetailOverlay(page);
      const row = page.getByRole("option", { name: new RegExp(item.title) });
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeVisible({ timeout: SLA_MS });

      const due = row.locator(".due-chip");
      const remText = row.locator(".reminder-text");
      await expect(due).toBeVisible();
      await expect(remText).toBeVisible();
      // Must keep a day word (not bare HH:MM)
      const dueT = ((await due.textContent()) ?? "").trim();
      const remT = ((await remText.textContent()) ?? "").trim();
      expect(dueT, loc.label).not.toMatch(/^\d{1,2}:\d{2}$/);
      expect(remT, loc.label).not.toMatch(/^\d{1,2}:\d{2}$/);

      const clipped = await row.evaluate((el) => {
        const bad: string[] = [];
        for (const sel of [".due-chip", ".reminder-chip", ".reminder-text"]) {
          const node = el.querySelector(sel) as HTMLElement | null;
          if (!node || getComputedStyle(node).display === "none") continue;
          if (node.scrollWidth > node.clientWidth + 1) {
            bad.push(
              `${sel} «${node.textContent}» sw=${node.scrollWidth} cw=${node.clientWidth}`,
            );
          }
        }
        return bad;
      });
      expect(clipped, `${loc.label}: ${clipped.join("; ")}`).toEqual([]);
    }
  });
});

test.describe("V03-L33 title readable at 390", () => {
  test("title width ≥ 60% of row content / ≥ 12ch at 390 en/fr/es/en-XA", async ({
    page,
  }) => {
    const item = await seedL29Item();
    const locales: Array<{
      code: "en" | "fr" | "es";
      pseudoXa?: boolean;
      label: string;
    }> = [
      { code: "en", label: "en" },
      { code: "fr", label: "fr" },
      { code: "es", label: "es" },
      { code: "en", pseudoXa: true, label: "en-XA" },
    ];
    for (const loc of locales) {
      await openLocale(page, loc.code, 390, { pseudoXa: loc.pseudoXa });
      await hideDetailOverlay(page);
      const row = page.getByRole("option", { name: new RegExp(item.title) });
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeVisible({ timeout: SLA_MS });
      const metrics = await row.evaluate((el) => {
        const title = el.querySelector(".item-title") as HTMLElement | null;
        const main = el.querySelector(".item-main") as HTMLElement | null;
        if (!title || !main) return null;
        const titleBox = title.getBoundingClientRect();
        const mainBox = main.getBoundingClientRect();
        const ch = Number.parseFloat(getComputedStyle(title).fontSize) || 14;
        return {
          titleW: titleBox.width,
          mainW: mainBox.width,
          ch,
          titleText: title.textContent ?? "",
        };
      });
      expect(metrics, loc.label).toBeTruthy();
      expect(metrics!.titleText.length, loc.label).toBeGreaterThan(8);
      expect(metrics!.titleW, loc.label).toBeGreaterThanOrEqual(12 * metrics!.ch * 0.55);
      expect(metrics!.titleW / metrics!.mainW, loc.label).toBeGreaterThanOrEqual(
        0.6,
      );
    }
  });
});

test.describe("V03 detail FR date fields unclipped @ 390", () => {
  test("FR detail due/reminder triggers scrollWidth <= clientWidth", async ({
    page,
  }) => {
    const item = await seedL29Item();
    await openLocale(page, "fr", 390);
    await page.goto(`/attention?item=${item.id}`);
    await waitInboxView(page, "attention");
    const zone = page.locator(".detail-zone");
    await expect(zone).toBeVisible({ timeout: SLA_MS });
    const triggers = zone.locator(".dtp-trigger");
    await expect(triggers.first()).toBeVisible({ timeout: SLA_MS });
    const n = await triggers.count();
    expect(n).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < n; i += 1) {
      const clip = await triggers.nth(i).evaluate((el) => {
        const html = el as HTMLElement;
        return {
          sw: html.scrollWidth,
          cw: html.clientWidth,
          text: html.value || html.textContent || "",
        };
      });
      expect(
        clip.sw <= clip.cw + 1,
        `trigger[${i}] «${clip.text}» sw=${clip.sw} cw=${clip.cw}`,
      ).toBe(true);
    }
  });
});

test.describe("V03-R13 .rel never clips", () => {
  for (const locale of ["en", "fr", "es", "en-XA"] as const) {
    for (const width of [1440, 1024, 768, 390] as const) {
      test(`${locale} @ ${width}: every .rel scrollWidth <= clientWidth`, async ({
        page,
      }) => {
        const locCode = locale === "en-XA" ? "en" : locale;
        await openLocale(page, locCode, width, {
          ...(locale === "en-XA" ? { pseudoXa: true } : {}),
        });
        if (width === 390) await hideDetailOverlay(page);
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
