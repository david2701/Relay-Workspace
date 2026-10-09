import { expect, type Page, test } from "./fixtures";

/** Fixed wall clock so shortcut preview strings (and widths) stay stable. */
const FROZEN_NOW = new Date("2026-10-08T12:00:00.000Z");

async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: FROZEN_NOW });
}

async function waitFontsAndLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  // Settle sheet/popover enter animations (--dur-overlay ≤ 240ms) + a paint.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
  await page.waitForTimeout(300);
}

async function openDuePicker(page: Page) {
  await freezeClock(page);
  await page.goto("/all");
  await page.locator('[data-inbox-view="all"]').waitFor({ timeout: 30_000 });
  await waitFontsAndLayout(page);
  const option = page.getByRole("option").first();
  await option.waitFor({ state: "visible", timeout: 30_000 });
  const id = await option.getAttribute("id");
  const itemId = id?.replace(/^row-/, "");
  expect(itemId).toBeTruthy();
  // Deep-link selection (reliable at narrow widths where the detail sheet covers the list).
  await page.goto(`/all?item=${itemId}`);
  await page.locator('[data-inbox-view="all"]').waitFor({ timeout: 30_000 });
  await waitFontsAndLayout(page);
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
  await waitFontsAndLayout(page);
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

test.describe("DatePicker sheet focus trap @ 390px (V12-D16)", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  async function openSheet(page: Page) {
    const dialog = await openDuePicker(page);
    await expect(dialog).toHaveClass(/sheet/);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    // Wait until focus has moved into the sheet and #root is inert.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const root = document.getElementById("root");
          const dialog = document.querySelector(".dtp-popover.sheet");
          const active = document.activeElement;
          return {
            inert: !!((root as (HTMLElement & { inert?: boolean }) | null)?.inert),
            inside: !!(dialog && active && dialog.contains(active)),
          };
        }),
      )
      .toEqual({ inert: true, inside: true });
    return dialog;
  }

  test("Tab ×30 and Shift+Tab ×30 stay inside the sheet", async ({ page }) => {
    const dialog = await openSheet(page);
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const d = document.querySelector(".dtp-popover.sheet");
        const a = document.activeElement;
        return !!(d && a && d.contains(a));
      });
      expect(inside, `Tab #${i + 1} left the sheet`).toBe(true);
    }
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Shift+Tab");
      const inside = await page.evaluate(() => {
        const d = document.querySelector(".dtp-popover.sheet");
        const a = document.activeElement;
        return !!(d && a && d.contains(a));
      });
      expect(inside, `Shift+Tab #${i + 1} left the sheet`).toBe(true);
    }
    await expect(dialog).toBeVisible();
  });

  test("background is inert — nothing behind the sheet is focusable", async ({
    page,
  }) => {
    await openSheet(page);
    const probe = await page.evaluate(() => {
      const root = document.getElementById("root") as
        | (HTMLElement & { inert?: boolean })
        | null;
      const dialog = document.querySelector(".dtp-popover.sheet");
      if (!root || !dialog) return { ok: false, reason: "missing nodes" };
      if (!root.inert) return { ok: false, reason: "root not inert" };
      const selector = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled]):not([type='hidden'])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ].join(",");
      const behind: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (dialog.contains(el)) continue;
        // inert subtree: focus() must be a no-op
        el.focus();
        if (document.activeElement === el) {
          behind.push(el.className || el.tagName);
        }
      }
      return { ok: behind.length === 0, behind, inert: root.inert };
    });
    expect(probe.ok, JSON.stringify(probe)).toBe(true);
  });

  test("Esc returns focus to .dtp-trigger", async ({ page }) => {
    await openSheet(page);
    const trigger = page.locator(".detail-zone .dtp-trigger").first();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("Listo returns focus to .dtp-trigger", async ({ page }) => {
    await openSheet(page);
    const trigger = page.locator(".detail-zone .dtp-trigger").first();
    await page.getByRole("button", { name: /^Listo$/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
    await expect(trigger).toBeFocused();
  });
});

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

    // B1: opaque surface + top-most at several interior points.
    const surface = await dialog.evaluate((el) => {
      const inner = el.querySelector(".dtp-popover-inner") as HTMLElement;
      const cs = getComputedStyle(inner);
      const bg = cs.backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      let alpha = 1;
      if (m) {
        const parts = m[1]!.split(",").map((s) => s.trim());
        if (parts.length === 4) alpha = Number.parseFloat(parts[3]!);
      }
      const ir = inner.getBoundingClientRect();
      const samples = [
        [0.2, 0.2],
        [0.75, 0.45],
        [0.35, 0.55],
        [0.85, 0.85],
      ].map(([fx, fy]) => {
        const x = ir.left + ir.width * fx!;
        const y = ir.top + ir.height * fy!;
        const top = document.elementFromPoint(x, y);
        return { x, y, onTop: !!(top && el.contains(top)) };
      });
      return {
        alpha,
        bg,
        z: getComputedStyle(el).zIndex,
        samples,
        isSheet: el.classList.contains("sheet"),
        hasScrim: !!el.querySelector(".dtp-scrim"),
      };
    });
    expect(surface.alpha).toBe(1);
    expect(surface.z === "auto" ? 0 : Number(surface.z)).toBeGreaterThanOrEqual(
      80,
    );
    for (const s of surface.samples) {
      expect(s.onTop).toBe(true);
    }
    if (width < 768) {
      expect(surface.isSheet).toBe(true);
      expect(surface.hasScrim).toBe(true);
    }
  });
}
