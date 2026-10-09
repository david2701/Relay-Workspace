import { expect, test, type APIRequestContext, type Page, E2E_API } from "./fixtures";

const API = E2E_API;

async function putSettings(
  request: APIRequestContext,
  timezone: string,
): Promise<void> {
  const res = await request.put(`${API}/api/settings`, {
    data: {
      timezone,
      user_display_name: "Alex",
      user_initial: "A",
      onboarding_completed_at: new Date().toISOString(),
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function prepareOnboarding(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${API}/api/store/prepare-onboarding`, {
    data: { variant: "empty", locale: "en" },
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

async function openTimezoneSettings(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("relay.locale", "en");
  });
  await page.goto("/attention?settings=timezone");
  await expect(page.getByRole("dialog")).toBeVisible();
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

test.describe("UTC alias equivalence — browser Etc/UTC, saved Etc/UTC", () => {
  test.use({ timezoneId: "Etc/UTC" });

  test("(a) Settings + onboarding show no mismatch notice", async ({
    page,
    request,
  }) => {
    await putSettings(request, "Etc/UTC");
    await openTimezoneSettings(page);
    await expect(page.locator(".settings-tz-diff")).toHaveCount(0);
    await expect(page.getByRole("dialog")).not.toContainText(
      /Your browser is set to/i,
    );

    await prepareOnboarding(request);
    // Keep saved zone Etc/UTC while onboarding is open.
    await request.put(`${API}/api/settings`, {
      data: { timezone: "Etc/UTC" },
    });
    await gotoOnboarding(page);
    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".settings-tz-diff")).toHaveCount(0);
    await expect(card).not.toContainText(
      /couldn’t recognize your browser’s time zone/i,
    );
    await expect(card).not.toContainText(/Your browser is set to/i);
  });
});

test.describe("UTC alias equivalence — browser UTC, saved Etc/UTC", () => {
  test.use({ timezoneId: "UTC" });

  test("(b) Settings + onboarding show no mismatch notice", async ({
    page,
    request,
  }) => {
    await putSettings(request, "Etc/UTC");
    await openTimezoneSettings(page);
    await expect(page.locator(".settings-tz-diff")).toHaveCount(0);
    await expect(page.getByRole("dialog")).not.toContainText(
      /Your browser is set to UTC/i,
    );

    await prepareOnboarding(request);
    await request.put(`${API}/api/settings`, {
      data: { timezone: "Etc/UTC" },
    });
    await gotoOnboarding(page);
    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();
    await expect(card).not.toContainText(/Your browser is set to/i);
    await expect(card).not.toContainText(
      /couldn’t recognize your browser’s time zone/i,
    );
  });
});

test.describe("UTC alias equivalence — control Paris vs Etc/UTC", () => {
  test.use({ timezoneId: "Europe/Paris" });

  test("(c) Settings still shows mismatch when zones differ", async ({
    page,
    request,
  }) => {
    await putSettings(request, "Etc/UTC");
    await openTimezoneSettings(page);
    await expect(page.locator(".settings-tz-diff")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      /Your browser is set to Europe\/Paris/i,
    );
    await expect(page.getByRole("dialog")).toContainText(/Relay uses Etc\/UTC/i);
    await expect(
      page.getByRole("button", { name: /Use Europe\/Paris/i }),
    ).toBeVisible();
  });
});
