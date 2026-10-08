import { expect, type Page, test } from "@playwright/test";

async function openDuePicker(page: Page) {
  await page.goto("/all");
  await page.locator('[data-inbox-view="all"]').waitFor({ timeout: 30_000 });
  const option = page.getByRole("option").first();
  await option.waitFor({ state: "visible", timeout: 30_000 });
  const id = await option.getAttribute("id");
  const itemId = id?.replace(/^row-/, "");
  expect(itemId).toBeTruthy();
  // Deep-link selection (reliable at narrow widths where the detail sheet covers the list).
  await page.goto(`/all?item=${itemId}`);
  await page.locator('[data-inbox-view="all"]').waitFor({ timeout: 30_000 });
  await expect(page.locator(`#row-${itemId}`)).toHaveAttribute(
    "aria-selected",
    "true",
    { timeout: 15_000 },
  );
  const trigger = page.locator(".detail-zone .dtp-trigger").first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click({ force: true });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/** True when label/value collide on one line (stacked sheet cells are OK). */
function shortcutLabelOverlapsValue(
  name: { x: number; y: number; width: number; height: number },
  when: { x: number; y: number; width: number; height: number },
): boolean {
  const stacked = name.y + name.height <= when.y + 1;
  if (stacked) return false;
  return boxesOverlap(name, when);
}

for (const width of [1440, 768, 390] as const) {
  test(`DatePicker layout @ ${width}px — no clip/overlap, in viewport, footer baseline`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const dialog = await openDuePicker(page);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).toBeTruthy();
    const vb = dialogBox!;
    // Fully inside the viewport (sheet or popover).
    expect(vb.x).toBeGreaterThanOrEqual(-1);
    expect(vb.y).toBeGreaterThanOrEqual(-1);
    expect(vb.x + vb.width).toBeLessThanOrEqual(width + 1);
    expect(vb.y + vb.height).toBeLessThanOrEqual(901);

    const shortcuts = dialog.locator(".dtp-shortcut");
    const n = await shortcuts.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      const row = shortcuts.nth(i);
      const name = row.locator(".dtp-shortcut-name");
      const when = row.locator(".dtp-shortcut-when");
      if ((await when.count()) === 0) continue;
      const nameBox = await name.boundingBox();
      const whenBox = await when.boundingBox();
      expect(nameBox).toBeTruthy();
      expect(whenBox).toBeTruthy();
      expect(shortcutLabelOverlapsValue(nameBox!, whenBox!)).toBe(false);
      // Value fully visible (no mid-glyph clip): right edge inside dialog.
      expect(whenBox!.x + whenBox!.width).toBeLessThanOrEqual(vb.x + vb.width + 1);
      // Label/value stay single-line glyphs (sheet may stack value under label).
      expect(nameBox!.height).toBeLessThanOrEqual(28);
      expect(whenBox!.height).toBeLessThanOrEqual(28);
      // No mid-glyph clip without ellipsis: scrollWidth fits or ellipsis applies.
      const clip = await row.evaluate((el) => {
        const n = el.querySelector(".dtp-shortcut-name") as HTMLElement | null;
        const w = el.querySelector(".dtp-shortcut-when") as HTMLElement | null;
        const check = (node: HTMLElement | null) => {
          if (!node) return true;
          if (node.scrollWidth <= node.clientWidth + 1) return true;
          const s = getComputedStyle(node);
          return s.textOverflow === "ellipsis" && s.overflow !== "visible";
        };
        return check(n) && check(w);
      });
      expect(clip).toBe(true);
    }

    const foot = dialog.locator(".dtp-foot");
    await expect(foot).toBeVisible();
    const clear = foot.locator(".dtp-clear");
    const listo = foot.getByRole("button", { name: /^Listo$/ });
    const time = foot.locator(".dtp-time-input");
    const clearBox = await clear.boundingBox();
    const listoBox = await listo.boundingBox();
    const timeBox = await time.boundingBox();
    expect(clearBox && listoBox && timeBox).toBeTruthy();
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(mid(clearBox!) - mid(listoBox!))).toBeLessThanOrEqual(4);
    expect(Math.abs(mid(timeBox!) - mid(listoBox!))).toBeLessThanOrEqual(6);

    // No child overflows the popover/sheet inner.
    const overflow = await dialog.evaluate((el) => {
      const inner = el.querySelector(".dtp-popover-inner") ?? el;
      const ir = inner.getBoundingClientRect();
      for (const node of inner.querySelectorAll("*")) {
        const r = (node as HTMLElement).getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > ir.right + 2 || r.left < ir.left - 2) {
          return (node as HTMLElement).className || node.tagName;
        }
      }
      return null;
    });
    expect(overflow).toBeNull();
  });
}
