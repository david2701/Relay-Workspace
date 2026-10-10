/**
 * After the demo store path (EN sample data, onboarding open), the card is
 * the preloaded variant: FR checkbox on, EN checkbox off (PR1 / V03-O10).
 */
import { expect, test, type APIRequestContext, type Page, E2E_API } from "./fixtures";

const API = E2E_API;

async function prepareDemoPreloaded(request: APIRequestContext): Promise<void> {
  // Same contract as `pnpm demo` seed: EN data + onboarding_completed_at null.
  const res = await request.post(`${API}/api/store/prepare-onboarding`, {
    data: { variant: "preloaded", locale: "en" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as {
    settings: { onboarding_completed_at: string | null };
    work_item_count: number;
  };
  expect(body.settings.onboarding_completed_at).toBeNull();
  expect(body.work_item_count).toBeGreaterThan(0);
}

async function gotoWithLocale(page: Page, locale: "en" | "fr"): Promise<void> {
  await page.addInitScript((code) => {
    localStorage.clear();
    localStorage.setItem("relay.locale", code);
    localStorage.setItem("relay.theme", "light");
  }, locale);
  await page.goto("/attention");
}

test.describe("Demo → preloaded onboarding card", () => {
  test.afterAll(async ({ request }) => {
    // Restore Playwright baseline (CLI seed marks onboarding done).
    const seed = await request.post(`${API}/api/seed`, {
      data: { locale: "en" },
    });
    expect(seed.ok(), await seed.text()).toBeTruthy();
    await request.put(`${API}/api/settings`, {
      data: {
        timezone: "Europe/Paris",
        user_display_name: "Alex",
        user_initial: "A",
        onboarding_completed_at: new Date().toISOString(),
      },
    });
  });

  test("EN: preloaded note, reload checkbox unchecked", async ({
    page,
    request,
  }) => {
    await prepareDemoPreloaded(request);
    await gotoWithLocale(page, "en");
    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Sample data is already loaded.");
    await expect(card.getByRole("checkbox")).not.toBeChecked();
    await expect(card.getByRole("button", { name: "Start" })).toBeVisible();
  });

  test("FR: preloaded note, reload checkbox checked", async ({
    page,
    request,
  }) => {
    await prepareDemoPreloaded(request);
    await gotoWithLocale(page, "fr");
    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(
      "Les données d’exemple sont déjà chargées.",
    );
    await expect(card.getByRole("checkbox")).toBeChecked();
    await expect(card.getByRole("button", { name: "Commencer" })).toBeVisible();
  });
});
