import { expect, type Page, type Locator } from "@playwright/test";

export async function waitInboxView(page: Page, view: string): Promise<void> {
  await expect(page.locator(`[data-inbox-view="${view}"]`)).toBeVisible({
    timeout: 5000,
  });
}

/** Assert every labeled section's «· N» matches its visible option rows. */
export async function expectSectionCountsMatch(page: Page): Promise<void> {
  const groups = page.locator('[role="group"]');
  const n = await groups.count();
  for (let i = 0; i < n; i += 1) {
    const group = groups.nth(i);
    const label = group.locator(".section-label");
    if ((await label.count()) === 0) continue;
    const text = (await label.textContent()) ?? "";
    const match = text.match(/·\s*(\d+)\s*$/);
    if (!match) continue;
    const expected = Number(match[1]);
    const rows = group.getByRole("option");
    await expect(rows).toHaveCount(expected);
  }
}

export async function expectHechosOnlyTerminal(page: Page): Promise<void> {
  await waitInboxView(page, "done");
  const rows = page.getByRole("option");
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const label = (await row.getAttribute("aria-label")) ?? "";
    expect(
      /Hecho|Cancelado/.test(label),
      `Hechos row must be terminal: ${label}`,
    ).toBeTruthy();
    expect(label.includes("Atascado")).toBeFalsy();
    expect(label.includes("Te necesita")).toBeFalsy();
  }
  await expectSectionCountsMatch(page);
}

export async function expectNoDuplicateTitles(
  page: Page,
  title: string,
): Promise<void> {
  await expect(page.getByRole("option", { name: new RegExp(title) })).toHaveCount(
    1,
  );
}

export async function expectAgentMarksAreSquares(scope: Locator): Promise<void> {
  const agents = scope.locator('.actor-mark[data-kind="agent"]');
  const n = await agents.count();
  for (let i = 0; i < n; i += 1) {
    const mark = agents.nth(i);
    await expect(mark).toHaveAttribute("data-shape", "square");
    const radius = await mark.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).not.toBe("50%");
  }
}
