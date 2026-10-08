import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:7430";

async function clearLocale(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("relay.locale");
    } catch {
      /* ignore */
    }
  });
}

/** Set locale once in the current document (does not re-run on reload). */
async function writeLocale(page: Page, locale: string): Promise<void> {
  await page.evaluate((loc) => {
    localStorage.setItem("relay.locale", loc);
  }, locale);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Settings|Ajustes|Réglages/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function closeSettings(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible().catch(() => false))) return;
  await dialog
    .getByRole("button", { name: /Close|Cerrar|Fermer/i })
    .click();
  await expect(dialog).toBeHidden();
}

async function saveTimezone(page: Page, tz: string): Promise<void> {
  await openSettings(page);
  const tzInput = page.getByRole("dialog").getByLabel(/Timezone|Zona horaria|Fuseau horaire/i);
  await tzInput.fill(tz);
  const save = page
    .getByRole("dialog")
    .getByRole("button", { name: /^(Save|Guardar|Enregistrer)$/ });
  const wait = page.waitForResponse(
    (r) =>
      r.url().includes("/api/settings") &&
      r.request().method() === "PUT" &&
      r.ok(),
  );
  await save.click();
  await wait;
  await closeSettings(page);
}

async function putSettings(
  request: APIRequestContext,
  patch: { timezone?: string },
): Promise<void> {
  const res = await request.put(`${API}/api/settings`, { data: patch });
  expect(res.ok()).toBeTruthy();
}

/** Today as date-only (23:59 wall) ISO in the given IANA zone. */
async function todayDateOnlyIso(page: Page, timeZone: string): Promise<string> {
  return page.evaluate((tz) => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const now = new Date();
    const parts = fmt.formatToParts(now);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    // Binary-search UTC instant whose wall clock in tz is y-m-d 23:59
    let lo = Date.UTC(y, m - 1, d - 1, 0, 0, 0);
    let hi = Date.UTC(y, m - 1, d + 2, 0, 0, 0);
    for (let i = 0; i < 40; i++) {
      const mid = Math.floor((lo + hi) / 2);
      const p = fmt.formatToParts(new Date(mid));
      const py = Number(p.find((x) => x.type === "year")?.value);
      const pm = Number(p.find((x) => x.type === "month")?.value);
      const pd = Number(p.find((x) => x.type === "day")?.value);
      const ph = Number(p.find((x) => x.type === "hour")?.value);
      const pmin = Number(p.find((x) => x.type === "minute")?.value);
      const key = ((py * 100 + pm) * 100 + pd) * 10000 + ph * 100 + pmin;
      const target = ((y * 100 + m) * 100 + d) * 10000 + 23 * 100 + 59;
      if (key === target) return new Date(mid).toISOString();
      if (key < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return new Date(lo).toISOString();
  }, timeZone);
}

async function mcpItemsList(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/mcp/invoke`, {
    data: {
      name: "items_list",
      arguments: { limit: 50, actor: { id: "grok-bot", type: "agent" } },
    },
    headers: { "X-Relay-Actor": "grok-bot", "X-Relay-Source": "mcp" },
  });
  expect(res.ok()).toBeTruthy();
  return res.text();
}

test.describe("AC3-L4/L5 locale", () => {
  test("fr-FR without stored preference → French UI + html lang", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: "fr-FR",
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await clearLocale(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByRole("navigation").getByRole("button", { name: /Attention/ }),
    ).toBeVisible();
    await context.close();
  });

  test("de-DE without stored preference → English fallback", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: "de-DE",
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await clearLocale(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("navigation").getByRole("button", { name: /Attention/ }),
    ).toBeVisible();
    await context.close();
  });

  test("manual locale survives reload and sets html lang", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: "en-US",
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/");
    await writeLocale(page, "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await openSettings(page);
    await page
      .getByRole("dialog")
      .getByLabel(/Language|Idioma|Langue/i)
      .selectOption("fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    const storedBefore = await page.evaluate(() =>
      localStorage.getItem("relay.locale"),
    );
    expect(storedBefore).toBe("fr");
    await closeSettings(page);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByRole("navigation").getByRole("button", { name: /Attention/ }),
    ).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem("relay.locale"));
    expect(stored).toBe("fr");
    await context.close();
  });

  test("live locale switch keeps selection and open detail", async ({
    page,
  }) => {
    await page.goto("/attention");
    await page.waitForSelector('[data-inbox-view="attention"]');
    const row = page.getByRole("option").first();
    await expect(row).toBeVisible();
    const title = ((await row.locator(".item-title").textContent()) ?? "").trim();
    await row.click();
    await expect(page.locator(".detail-zone")).toBeVisible();

    await openSettings(page);
    await page
      .getByRole("dialog")
      .getByLabel(/Language|Idioma|Langue/i)
      .selectOption("en");
    await closeSettings(page);

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("navigation").getByRole("button", { name: /Attention/ }),
    ).toBeVisible();
    await expect(page.locator(".detail-zone")).toBeVisible();
    await expect(
      page.getByRole("option", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }),
    ).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("AC3-L7 timezone", () => {
  test("today no-time stays listed; Paris switch persists via settings", async ({
    page,
    request,
  }) => {
    await putSettings(request, { timezone: "America/New_York" });
    await page.goto("/all");
    await saveTimezone(page, "America/New_York");

    const dueAt = await todayDateOnlyIso(page, "America/New_York");
    const itemRes = await request.post(`${API}/api/items`, {
      data: { title: "TZ probe today no-time", due_at: dueAt },
      headers: { "X-Relay-Source": "ui" },
    });
    expect(itemRes.ok(), await itemRes.text()).toBeTruthy();

    await page.goto("/all");
    await page.waitForSelector('[data-inbox-view="all"]');
    await expect(
      page.getByRole("option", { name: /TZ probe today no-time/ }),
    ).toBeVisible();

    await saveTimezone(page, "Europe/Paris");

    const settingsParis = await request.get(`${API}/api/settings`);
    const s = (await settingsParis.json()) as { settings: { timezone: string } };
    expect(s.settings.timezone).toBe("Europe/Paris");

    await expect(
      page.getByRole("option", { name: /TZ probe today no-time/ }),
    ).toBeVisible();
  });
});

test.describe("AC3-L9 actor=david alias", () => {
  test("old URL actor=david works and is rewritten to user", async ({
    page,
  }) => {
    await page.goto("/all?actor=david");
    await page.waitForSelector('[data-inbox-view="all"]');
    await expect
      .poll(() => page.url())
      .toMatch(/actor=user/);
    expect(page.url()).not.toMatch(/actor=david/);
  });
});

test.describe("AC3-L10 MCP locale-invariant", () => {
  test("MCP tool list/items identical with UI locale en vs fr", async ({
    request,
    page,
  }) => {
    await page.goto("/");
    await writeLocale(page, "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const enBody = await mcpItemsList(request);

    await writeLocale(page, "fr");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    const frBody = await mcpItemsList(request);

    expect(frBody).toBe(enBody);
  });
});
