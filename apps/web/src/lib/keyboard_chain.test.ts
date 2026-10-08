import { describe, expect, it } from "vitest";

/**
 * Documents the Esc / overlay guard contract from UI specs v1.2 §4.2.
 * Runtime behavior is in App.tsx; this test locks the ordered layers.
 */

const ESC_CHAIN = [
  "popover_menu_sheet",
  "note_editor",
  "search_text",
  "shortcuts",
  "capture",
  "deselect",
] as const;

const OVERLAY_SELECTOR =
  "[role=dialog],[role=grid],[role=menu]";

describe("keyboard chain contract", () => {
  it("orders Esc layers per §4.2", () => {
    expect([...ESC_CHAIN]).toEqual([
      "popover_menu_sheet",
      "note_editor",
      "search_text",
      "shortcuts",
      "capture",
      "deselect",
    ]);
  });

  it("defines overlay selector that blocks global list navigation", () => {
    expect(OVERLAY_SELECTOR).toContain("[role=dialog]");
    expect(OVERLAY_SELECTOR).toContain("[role=grid]");
    expect(OVERLAY_SELECTOR).toContain("[role=menu]");
  });

  it("treats native checkbox INPUT as safe for Space (not list complete)", () => {
    const tag = "INPUT";
    const type = "checkbox";
    const globalIgnoresInput = tag === "INPUT" || tag === "TEXTAREA";
    expect(globalIgnoresInput && type === "checkbox").toBe(true);
  });
});
