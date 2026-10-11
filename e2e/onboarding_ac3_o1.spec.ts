import { expect, test, type APIRequestContext, type Page, E2E_API } from "./fixtures";

const API = E2E_API;

async function prepareOnboarding(
  request: APIRequestContext,
  variant: "empty" | "preloaded",
  locale: "en" | "fr" | "es" = "en",
): Promise<void> {
  const res = await request.post(`${API}/api/store/prepare-onboarding`, {
    data: { variant, locale },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as {
    work_item_count: number;
    settings: { onboarding_completed_at: string | null };
  };
  expect(body.settings.onboarding_completed_at).toBeNull();
  if (variant === "empty") expect(body.work_item_count).toBe(0);
  else expect(body.work_item_count).toBeGreaterThan(0);
}

async function gotoFresh(page: Page, locale = "en"): Promise<void> {
  await page.addInitScript((loc) => {
    localStorage.setItem("relay.locale", loc);
  }, locale);
  await page.goto("/attention");
}

/** Restore the Playwright webServer baseline so later specs see the list. */
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

test.afterEach(async ({ request }) => {
  await restoreE2eBaseline(request);
});

test.describe("AC3-O1 onboarding empty store", () => {
  test("card → start empty → reload + second client hide card, 0 items", async ({
    page,
    request,
    browser,
  }) => {
    await prepareOnboarding(request, "empty");
    await gotoFresh(page, "en");

    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { level: 1 })).toHaveText(
      "Set up Relay",
    );
    const name = page.locator("#onboarding-name");
    await expect(name).toBeFocused();

    await name.fill("Ana");
    await expect(card.locator(".actor-mark")).toHaveText("A");

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/settings") &&
          r.request().method() === "PUT" &&
          r.ok(),
      ),
      card.getByRole("button", { name: "Start empty" }).click(),
    ]);

    await expect(card).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

    const itemsRes = await request.get(`${API}/api/items?limit=1`);
    expect(itemsRes.ok()).toBeTruthy();
    const itemsBody = (await itemsRes.json()) as { total_count: number };
    expect(itemsBody.total_count).toBe(0);

    await page.reload();
    await expect(page.locator(".onboarding-card")).toHaveCount(0);

    const other = await browser.newContext();
    const page2 = await other.newPage();
    await page2.goto("/attention");
    await expect(page2.locator(".onboarding-card")).toHaveCount(0);
    await other.close();
  });

  test("sample data creates items; empty name does not submit", async ({
    page,
    request,
  }) => {
    await prepareOnboarding(request, "empty");
    await gotoFresh(page, "en");
    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();

    let settingsPuts = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/settings") && req.method() === "PUT") {
        settingsPuts += 1;
      }
    });

    await card.getByRole("button", { name: "Load sample data" }).click();
    await expect(card.getByRole("alert")).toContainText(
      "Enter your name to continue",
    );
    expect(settingsPuts).toBe(0);

    await page.locator("#onboarding-name").fill("Sam");
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/seed") && r.request().method() === "POST",
      ),
      card.getByRole("button", { name: "Load sample data" }).click(),
    ]);
    await expect(card).toHaveCount(0);

    const itemsRes = await request.get(`${API}/api/items`);
    expect(itemsRes.ok()).toBeTruthy();
    const itemsBody = (await itemsRes.json()) as {
      items: Array<{
        status: string;
        blocked_reason: string | null;
        needs_you_reason: string | null;
        reminder_at: string | null;
        reminder_intent: string | null;
        completed_by_type: string | null;
      }>;
    };
    expect(itemsBody.items.length).toBeGreaterThan(0);
    const statuses = new Set(itemsBody.items.map((i) => i.status));
    for (const required of [
      "inbox",
      "assigned",
      "in_progress",
      "blocked",
      "needs_you",
      "done",
      "cancelled",
    ]) {
      expect(statuses.has(required), `missing status ${required}`).toBeTruthy();
    }
    expect(
      itemsBody.items.some(
        (i) =>
          i.status === "needs_you" &&
          (i.needs_you_reason?.trim().length ?? 0) >= 3,
      ),
    ).toBeTruthy();
    expect(
      itemsBody.items.some(
        (i) =>
          i.status === "blocked" && (i.blocked_reason?.trim().length ?? 0) >= 3,
      ),
    ).toBeTruthy();
    expect(
      itemsBody.items.some(
        (i) => i.reminder_at != null && (i.reminder_intent?.trim().length ?? 0) > 0,
      ),
    ).toBeTruthy();
    expect(
      itemsBody.items.some(
        (i) => i.status === "done" && i.completed_by_type === "agent",
      ),
    ).toBeTruthy();

    const notesRes = await request.get(`${API}/api/notes`);
    const notesBody = (await notesRes.json()) as { notes: { id: string }[] };
    let linked = 0;
    for (const note of notesBody.notes) {
      const detail = await request.get(`${API}/api/notes/${note.id}`);
      const body = (await detail.json()) as {
        links: unknown[];
      };
      linked += body.links.length;
    }
    expect(linked).toBeGreaterThanOrEqual(3);

    const agents = await request.get(`${API}/api/agents`);
    const agentBody = (await agents.json()) as {
      agents: { id: string; display_name: string }[];
    };
    const code = agentBody.agents.find((a) => a.id === "agent-code");
    expect(code?.display_name).toBe("Code agent");
  });
});

test.describe("AC3-O10 preloaded onboarding variant", () => {
  test("FR: note + reload checkbox checked by default; reload renames agents", async ({
    page,
    request,
  }) => {
    await prepareOnboarding(request, "preloaded", "en");
    const beforeAgents = await request.get(`${API}/api/agents`);
    const beforeBody = (await beforeAgents.json()) as {
      agents: { id: string; display_name: string; monogram: string }[];
    };
    const beforeCode = beforeBody.agents.find((a) => a.id === "agent-code");
    expect(beforeCode?.display_name).toBe("Code agent");
    expect(beforeCode?.monogram).toBe("CO");

    await page.addInitScript(() => {
      localStorage.setItem("relay.locale", "fr");
    });
    await page.goto("/attention");

    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(
      "Les données d’exemple sont déjà chargées.",
    );
    const reload = card.getByRole("checkbox");
    await expect(reload).toBeChecked();
    await expect(card.getByRole("button", { name: "Commencer" })).toBeVisible();
    await expect(
      card.getByRole("button", { name: /Charger des données/i }),
    ).toHaveCount(0);

    await page.locator("#onboarding-name").fill("Camille");
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/seed") && r.request().method() === "POST",
      ),
      card.getByRole("button", { name: "Commencer" }).click(),
    ]);
    await expect(card).toHaveCount(0);

    const afterAgents = await request.get(`${API}/api/agents`);
    const afterBody = (await afterAgents.json()) as {
      agents: { id: string; display_name: string; monogram: string }[];
    };
    const afterCode = afterBody.agents.find((a) => a.id === "agent-code");
    expect(afterCode?.id).toBe("agent-code");
    expect(afterCode?.display_name).toBe("Agent de code");
    expect(afterCode?.monogram).toBe("CO");

    const items = await request.get(`${API}/api/items`);
    const list = (await items.json()) as { items: { title: string }[] };
    expect(
      list.items.some((i) => /Préparer|Choisir|Migrer|Relire/.test(i.title)),
    ).toBeTruthy();
  });

  test("EN: checkbox unchecked; Start without reload keeps EN agent names", async ({
    page,
    request,
  }) => {
    await prepareOnboarding(request, "preloaded", "en");
    await gotoFresh(page, "en");
    const card = page.locator(".onboarding-card");
    await expect(card).toBeVisible();
    await expect(card.getByRole("checkbox")).not.toBeChecked();

    await page.locator("#onboarding-name").fill("Alex");
    let seedCalls = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/seed") && req.method() === "POST") {
        seedCalls += 1;
      }
    });
    await card.getByRole("button", { name: "Start" }).click();
    await expect(card).toHaveCount(0);
    expect(seedCalls).toBe(0);

    const agents = await request.get(`${API}/api/agents`);
    const body = (await agents.json()) as {
      agents: { id: string; display_name: string }[];
    };
    expect(body.agents.find((a) => a.id === "agent-code")?.display_name).toBe(
      "Code agent",
    );
  });

  test("V03-O11: language change toggles checkbox unless manually touched", async ({
    page,
    request,
  }) => {
    await prepareOnboarding(request, "preloaded", "en");
    await gotoFresh(page, "fr");
    const card = page.locator(".onboarding-card");
    const reload = card.getByRole("checkbox");
    await expect(reload).toBeChecked();

    await card.locator("label").filter({ hasText: "English" }).click();
    await expect(reload).not.toBeChecked();
    await card.locator("label").filter({ hasText: "Español" }).click();
    await expect(reload).toBeChecked();

    await reload.uncheck();
    await expect(reload).not.toBeChecked();
    await card.locator("label").filter({ hasText: "Français" }).click();
    await expect(reload).not.toBeChecked();
  });
});
