import { expect, type Page, test } from "./fixtures";

async function openNoteEditor(page: Page, base = "") {
  const root = base.replace(/\/$/, "");
  await page.goto(`${root}/notes`);
  // Prefer a seed note (stable), not leftovers from other e2e writers.
  const seed = page
    .locator(".notes-list .note-card, .list-note")
    .filter({ hasText: /Brief de lanzamiento|Notas de entrevista|Nombre del producto/ })
    .first();
  const card =
    (await seed.count()) > 0
      ? seed
      : page.locator(".notes-list .note-card, .list-note").first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  await card.click();
  await page.locator(".note-view").waitFor({ state: "visible", timeout: 30_000 });
  // Wait until the note body loaded (not the error/skeleton state).
  await expect(page.locator(".note-view .note-title, .note-view .note-empty")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".note-error")).toHaveCount(0);
  // Click Editar — more reliable than the global E shortcut if focus is elsewhere.
  const editBtn = page.getByRole("button", { name: /Editar/i });
  if ((await editBtn.count()) > 0) {
    await editBtn.click();
  } else {
    await page.keyboard.press("e");
  }
  const ta = page.locator("textarea.note-textarea");
  await ta.waitFor({ state: "visible", timeout: 15_000 });
  return ta;
}

async function assertStableAutosave(
  page: Page,
  ta: ReturnType<Page["locator"]>,
  label: string,
) {
  const patches: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/api/notes/")) {
      patches.push(req.postData() ?? "");
    }
  });

  const handle = await ta.elementHandle();
  expect(handle).toBeTruthy();
  const marker = `M11-${label}-${Date.now()}`;
  await ta.click();
  await page.keyboard.press("Control+A");
  await ta.type(`start body\n${marker}`, { delay: 20 });

  // > 2.5 s at 750 ms poll ≈ 3+ poll cycles
  await page.waitForTimeout(2800);

  const stillSame = await ta.evaluate((el, h) => el === h, handle);
  expect(stillSame, "textarea remounted under poll").toBe(true);
  await expect(ta).toBeFocused();
  await expect(ta).toHaveValue(new RegExp(marker));
  await expect
    .poll(() => patches.some((b) => b.includes(marker)), { timeout: 5_000 })
    .toBe(true);
}

test.describe("V12-M11 note editor stable under poll", () => {
  test("normal DB — no remount across 3+ polls; PATCH autosave", async ({
    page,
  }) => {
    const ta = await openNoteEditor(page);
    await assertStableAutosave(page, ta, "normal");
  });
});

test.describe("V12-M11 note editor on large DB", () => {
  test("large DB — no remount across 3+ polls; PATCH autosave", async ({
    browser,
  }) => {
    test.skip(
      !process.env.E2E_LARGE_WEB,
      "Set E2E_LARGE_WEB to exercise the 10k DB",
    );
    const large = process.env.E2E_LARGE_WEB!.replace(/\/$/, "");
    const context = await browser.newContext({
      baseURL: large,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const ta = await openNoteEditor(page, large);
    await assertStableAutosave(page, ta, "large");
    await context.close();
  });
});
