import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:7430";

async function prepareOnboarding(
  request: APIRequestContext,
  variant: "empty" | "preloaded" = "empty",
): Promise<void> {
  const res = await request.post(`${API}/api/store/prepare-onboarding`, {
    data: { variant, locale: "en" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function restoreE2eBaseline(request: APIRequestContext): Promise<void> {
  const seed = await request.post(`${API}/api/seed`, {
    data: { locale: "en" },
  });
  expect(seed.ok(), await seed.text()).toBeTruthy();
  const settings = await request.put(`${API}/api/settings`, {
    data: {
      timezone: "Europe/Paris",
      user_display_name: "Alex",
      user_initial: "A",
      onboarding_completed_at: new Date().toISOString(),
    },
  });
  expect(settings.ok(), await settings.text()).toBeTruthy();
}

async function gotoOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("relay.locale", "en");
  });
  await page.goto("/attention");
}

test.afterEach(async ({ request }) => {
  await restoreE2eBaseline(request);
});

test.describe("UTC browser time zone", () => {
  test.use({ timezoneId: "UTC" });

  test("onboarding accepts UTC without unknown-zone warning", async ({
    page,
    request,
  }) => {
    await prepareOnboarding(request, "empty");
    await gotoOnboarding(page);

    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();

    const resolved = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(resolved).toBe("UTC");

    await expect(
      card.getByText(/couldn’t recognize your browser’s time zone/i),
    ).toHaveCount(0);
    await expect(card.locator(".onboarding-tz-line")).toContainText("UTC");
    await expect(card.getByText(/Detected from your browser/i)).toBeVisible();

    // UTC (and Etc/UTC) lead the picker even when Intl omits them.
    await card.getByRole("button", { name: /^Change$/i }).click();
    const utcOption = card
      .locator(".settings-tz-list button")
      .filter({ hasText: /^UTC$/ });
    const etcUtcOption = card
      .locator(".settings-tz-list button")
      .filter({ hasText: /^Etc\/UTC$/ });
    await expect(utcOption.first()).toBeVisible();
    await expect(etcUtcOption.first()).toBeVisible();
    await utcOption.first().click();
    await expect(card.locator(".onboarding-tz-line")).toContainText("UTC");
  });
});
