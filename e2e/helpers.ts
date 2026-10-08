import { expect, type Page, type Locator } from "@playwright/test";

export async function waitInboxView(page: Page, view: string): Promise<void> {
  await expect(page.locator(`[data-inbox-view="${view}"]`)).toBeVisible({
    timeout: 5000,
  });
}

/** Assert every labeled section's «· N» matches data-section-count (model count). */
export async function expectSectionCountsMatch(page: Page): Promise<void> {
  const groups = page.locator('.item-list [role="group"]');
  const n = await groups.count();
  for (let i = 0; i < n; i += 1) {
    const group = groups.nth(i);
    const label = group.locator(".section-label");
    if ((await label.count()) === 0) continue;
    const text = (await label.textContent()) ?? "";
    const match = text.match(/·\s*(\d+)\s*$/);
    if (!match) continue;
    const expected = Number(match[1]);
    const attr = await group.getAttribute("data-section-count");
    if (attr !== null) expect(Number(attr)).toBe(expected);
    const rows = group.getByRole("option");
    const visible = await rows.count();
    const virtualized =
      (await group.getAttribute("data-virtualized")) === "true";
    if (virtualized) {
      // Only mounted rows are in the DOM; count must be ≤ model N.
      expect(visible).toBeLessThanOrEqual(expected);
    } else {
      await expect(rows).toHaveCount(expected);
    }
  }
}

/** Rail Atención counter must equal Te necesita data-section-count when shown. */
export async function expectRailMatchesTeNecesita(page: Page): Promise<void> {
  const te = page.getByRole("group", { name: /^Te necesita$/ });
  if ((await te.count()) === 0) return;
  const attr = await te.first().getAttribute("data-section-count");
  const expected = attr !== null ? Number(attr) : 0;
  const counter = page.locator('[data-rail-counter="attention"]');
  if (expected === 0) {
    await expect(counter).toHaveCount(0);
    return;
  }
  await expect(counter).toHaveText(String(expected));
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
    expect(Number.parseFloat(radius)).toBeLessThan(50);
  }
}

export async function expectUserMarksAreCircles(scope: Locator): Promise<void> {
  const users = scope.locator('.actor-mark[data-kind="user"]');
  const n = await users.count();
  for (let i = 0; i < n; i += 1) {
    const mark = users.nth(i);
    await expect(mark).toHaveAttribute("data-shape", "circle");
    const radius = await mark.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).toBe("50%");
  }
}

/** Sample Hechos (or any view) at fixed delays after a click; assert terminal-only. */
export async function sampleViewAfterClick(
  page: Page,
  clickName: RegExp,
  view: string,
  delaysMs: readonly number[],
  assertFn: (page: Page) => Promise<void>,
): Promise<void> {
  await page.getByRole("button", { name: clickName }).click();
  const t0 = Date.now();
  for (const delay of delaysMs) {
    const wait = Math.max(0, delay - (Date.now() - t0));
    if (wait > 0) await page.waitForTimeout(wait);
    // While skeleton, data-inbox-view may be empty — that's OK (no ghost rows).
    const ready = page.locator(`[data-inbox-view="${view}"]`);
    if ((await ready.count()) > 0) {
      await assertFn(page);
    } else {
      await expect(page.getByRole("option")).toHaveCount(0);
    }
  }
  await waitInboxView(page, view);
  await assertFn(page);
}
