import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:7430";

type Locale = "en" | "fr" | "es";

const LABELS: Record<
  Locale,
  { byYou: RegExp; completedByYou: RegExp; navDone: RegExp }
> = {
  en: {
    byYou: /Cancelled by you/i,
    completedByYou: /Completed by you/i,
    navDone: /^Done$/,
  },
  fr: {
    byYou: /Annulé par vous/i,
    completedByYou: /Terminé par vous/i,
    navDone: /^Faits$/,
  },
  es: {
    byYou: /Cancelado por ti/i,
    completedByYou: /Completado por ti/i,
    navDone: /^Hechos$/,
  },
};

async function putSettings(
  request: APIRequestContext,
  patch: Record<string, string>,
): Promise<void> {
  const res = await request.put(`${API}/api/settings`, { data: patch });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function createCancelledItem(
  request: APIRequestContext,
  title: string,
): Promise<{ id: string; title: string }> {
  const created = await request.post(`${API}/api/items`, {
    data: { title },
    headers: {
      "X-Relay-Actor": "user",
      "X-Relay-Source": "ui",
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const body = (await created.json()) as { item: { id: string; title: string } };
  const cancelled = await request.post(
    `${API}/api/items/${body.item.id}/status`,
    {
      data: { status: "cancelled" },
      headers: {
        "X-Relay-Actor": "user",
        "X-Relay-Source": "ui",
      },
    },
  );
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  return body.item;
}

async function gotoLocale(page: Page, locale: Locale): Promise<void> {
  await page.addInitScript((loc) => {
    localStorage.setItem("relay.locale", loc);
  }, locale);
  await page.goto("/done");
}

test.describe("cancelled-by provenance labels", () => {
  for (const locale of ["en", "fr", "es"] as const) {
    test(`row + detail show cancelled-by in ${locale}`, async ({
      page,
      request,
    }) => {
      await putSettings(request, {
        timezone: "Europe/Paris",
        user_display_name: "Alex",
        user_initial: "A",
        onboarding_completed_at: new Date().toISOString(),
      });
      const title = `Cancel label ${locale} ${Date.now()}`;
      await createCancelledItem(request, title);
      await gotoLocale(page, locale);

      const copy = LABELS[locale];
      await page.getByRole("button", { name: copy.navDone }).click();
      await expect(page.locator('[data-inbox-view="done"]')).toBeVisible();

      const row = page.getByRole("option", { name: new RegExp(title) });
      await expect(row).toBeVisible();
      await expect(row).toContainText(copy.byYou);
      await expect(row).not.toContainText(copy.completedByYou);

      await row.click({ force: true });
      const detail = page.locator(".detail-zone");
      await expect(detail.locator(".completed-by")).toContainText(copy.byYou);
      await expect(detail.locator(".completed-by")).not.toContainText(
        copy.completedByYou,
      );
    });
  }
});
