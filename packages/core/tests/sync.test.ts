import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeCursor } from "../src/domain/cursor.js";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";

describe("inbox sync delta", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-sync-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns upserts for changes since cursor and removals when leaving a view", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    const a = svc.createItem({ title: "Alpha" }, actor, "ui");
    svc.delegate(a.id, "agent-code", actor, "ui");
    svc.askUser(
      a.id,
      "Need a decision on Alpha",
      { type: "agent", id: "agent-code" },
      "mcp",
    );
    const snap = svc.inboxQuery("attention");
    if ("mode" in snap) throw new Error("expected snapshot");
    const since = snap.sync_cursor;
    expect(since).toBeTruthy();

    const b = svc.createItem({ title: "Beta" }, actor, "ui");
    svc.delegate(b.id, "agent-code", actor, "ui");
    svc.askUser(
      b.id,
      "Need a decision on Beta",
      { type: "agent", id: "agent-code" },
      "mcp",
    );

    // Move Alpha out of attention (needs_you → assigned)
    svc.setStatus(
      a.id,
      { status: "assigned" },
      { type: "agent", id: "agent-code" },
      "mcp",
    );

    const delta = svc.inboxQuery("attention", { since: since ?? "" });
    if (!("mode" in delta) || delta.mode !== "delta") {
      throw new Error("expected delta");
    }
    expect(delta.upserts.map((i) => i.id)).toContain(b.id);
    expect(delta.removed_ids).toContain(a.id);
    expect(delta.total_count).toBe(1);
    expect(delta.counters.needs_you).toBe(1);
    expect(delta.sync_cursor).toBeTruthy();
    expect(delta.server_time).toBeTruthy();
  });

  it("listUpdatedSince returns only newer rows", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    const first = svc.createItem({ title: "First" }, actor, "ui");
    const second = svc.createItem({ title: "Second" }, actor, "ui");
    const earlier = "2026-06-01T12:00:00.000Z";
    const later = "2026-06-01T12:00:01.000Z";
    svc.stampItemUpdatedAt(first.id, earlier, actor);
    svc.stampItemUpdatedAt(second.id, later, actor);
    // Composite after `first` — exclusive on (updated_at, id).
    const page = svc.listUpdatedSince(
      encodeCursor({ updated_at: earlier, id: first.id }),
    );
    expect(page.meta.total_count).toBe(1);
    expect(page.items.map((i) => i.id)).toEqual([second.id]);
  });

  it("listUpdatedSince pages same-ms item rows", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    const a = svc.createItem({ title: "A" }, actor, "ui");
    const b = svc.createItem({ title: "B" }, actor, "ui");
    const sameMs = "2026-06-01T12:00:00.000Z";
    svc.stampItemUpdatedAt(a.id, sameMs, actor);
    svc.stampItemUpdatedAt(b.id, sameMs, actor);
    const [firstId, secondId] = [a.id, b.id].sort();
    // Legacy ISO since with id="" still surfaces both; page them with limit 1.
    const page1 = svc.listUpdatedSince("1970-01-01T00:00:00.000Z", {
      limit: 1,
    });
    expect(page1.items.map((i) => i.id)).toEqual([firstId]);
    expect(page1.meta.has_more).toBe(true);
    expect(page1.meta.next_cursor).toBeTruthy();
    // Same ms as first row: timestamp-only `updated_at > ?` would drop secondId.
    const page2 = svc.listUpdatedSince(page1.meta.next_cursor ?? "", {
      limit: 1,
    });
    expect(page2.items.map((i) => i.id)).toEqual([secondId]);
    // Explicit composite after the first id also recovers the missing twin.
    const afterFirst = encodeCursor({
      updated_at: sameMs,
      id: firstId,
    });
    const twin = svc.listUpdatedSince(afterFirst);
    expect(twin.items.map((i) => i.id)).toEqual([secondId]);
  });

  it("listNotesUpdatedSince pages same-ms note rows", () => {
    const a = svc.createNote({ title: "Note A", body_md: "a" });
    const b = svc.createNote({ title: "Note B", body_md: "b" });
    const sameMs = "2026-06-01T12:00:00.000Z";
    svc.stampNoteUpdatedAt(a.id, sameMs);
    svc.stampNoteUpdatedAt(b.id, sameMs);
    const [firstId, secondId] = [a.id, b.id].sort();
    const page1 = svc.listNotesUpdatedSince("1970-01-01T00:00:00.000Z", {
      limit: 1,
    });
    expect(page1.items.map((n) => n.id)).toEqual([firstId]);
    expect(page1.meta.next_cursor).toBeTruthy();
    const page2 = svc.listNotesUpdatedSince(page1.meta.next_cursor ?? "", {
      limit: 1,
    });
    expect(page2.items.map((n) => n.id)).toEqual([secondId]);
    const afterFirst = encodeCursor({
      updated_at: sameMs,
      id: firstId,
    });
    const twin = svc.listNotesUpdatedSince(afterFirst);
    expect(twin.items.map((n) => n.id)).toEqual([secondId]);
  });
});
