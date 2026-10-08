import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeCursor } from "../src/domain/cursor.js";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";

describe("keyset pagination", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-page-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("pages without dupes or gaps across inserts and updates", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const item = svc.createItem({ title: `Item ${i}` }, actor, "ui");
      ids.push(item.id);
    }
    const page1 = svc.listItems({ limit: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page1.meta.has_more).toBe(true);
    expect(page1.meta.total_count).toBe(10);
    expect(page1.meta.next_cursor).toBeTruthy();

    const page2 = svc.listItems({
      limit: 3,
      cursor: page1.meta.next_cursor ?? undefined,
    });
    const page3 = svc.listItems({
      limit: 3,
      cursor: page2.meta.next_cursor ?? undefined,
    });
    const page4 = svc.listItems({
      limit: 3,
      cursor: page3.meta.next_cursor ?? undefined,
    });

    const all = [
      ...page1.items,
      ...page2.items,
      ...page3.items,
      ...page4.items,
    ];
    expect(all).toHaveLength(10);
    const seen = new Set(all.map((i) => i.id));
    expect(seen.size).toBe(10);

    // Insert a brand-new item (newest updated_at) — should not appear mid-page walk
    // when continuing from an existing cursor; keyset stays stable for older rows.
    const cursor = page1.meta.next_cursor;
    expect(cursor).toBeTruthy();
    const decoded = decodeCursor(cursor ?? "");
    expect(decoded?.id).toBe(page1.items[2]?.id);

    svc.createItem({ title: "Brand new" }, actor, "ui");
    const continued = svc.listItems({ limit: 3, cursor: cursor ?? undefined });
    const continuedIds = new Set(continued.items.map((i) => i.id));
    for (const id of page1.items.map((i) => i.id)) {
      expect(continuedIds.has(id)).toBe(false);
    }

    // Update an already-seen item — its new updated_at moves it ahead of the cursor
    // so it must not reappear on the continuation page (no dupes).
    const firstId = page1.items[0]?.id;
    expect(firstId).toBeTruthy();
    if (firstId) {
      svc.updateItem(firstId, { title: "Updated title" }, actor);
    }
    const afterUpdate = svc.listItems({
      limit: 20,
      cursor: cursor ?? undefined,
    });
    const afterIds = afterUpdate.items.map((i) => i.id);
    expect(afterIds.filter((id) => id === firstId)).toHaveLength(0);
  });

  it("inbox query pagination keeps full section_counts", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    for (let i = 0; i < 5; i += 1) {
      const item = svc.createItem({ title: `Need ${i}` }, actor, "ui");
      svc.delegate(item.id, "grok-bot", actor, "ui");
      svc.askUser(
        item.id,
        `Question number ${i} please`,
        { type: "agent", id: "grok-bot" },
        "mcp",
      );
    }
    const snap = svc.inboxQuery("attention", { limit: 2 });
    if ("mode" in snap) throw new Error("expected snapshot");
    expect(snap.items).toHaveLength(2);
    expect(snap.total_count).toBe(5);
    expect(snap.section_counts?.needs_you).toBe(5);
    expect(snap.has_more).toBe(true);
    expect(snap.next_cursor).toBeTruthy();
    const page2 = svc.inboxQuery("attention", {
      limit: 2,
      cursor: snap.next_cursor ?? undefined,
    });
    if ("mode" in page2) throw new Error("expected snapshot");
    const ids = new Set([
      ...snap.items.map((i) => i.id),
      ...page2.items.map((i) => i.id),
    ]);
    expect(ids.size).toBe(4);
  });
});
