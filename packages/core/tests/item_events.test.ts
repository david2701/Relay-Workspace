import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";
import { openDatabase } from "../src/store/db.js";
import { latestEventSeq, listItemEvents } from "../src/store/event_log.js";

describe("item_events log", () => {
  let dir: string;
  let svc: RelayService;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-events-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("assigns strictly increasing gap-free seq under 200 concurrent writes", async () => {
    const writers = Array.from({ length: 200 }, (_, i) =>
      Promise.resolve(svc.createItem({ title: `C${i}` }, actor, "ui")),
    );
    const items = await Promise.all(writers);
    expect(items).toHaveLength(200);
    const page = svc.listChanges({ after_seq: 0, limit: 200 });
    expect(page.events).toHaveLength(200);
    expect(page.has_more).toBe(false);
    const seqs = page.events.map((e) => e.seq);
    expect(seqs[0]).toBe(1);
    for (let i = 1; i < seqs.length; i += 1) {
      expect(seqs[i]).toBe((seqs[i - 1] ?? 0) + 1);
    }
    expect(latestEventSeq(svc.db)).toBe(200);
  });

  it("rolls back the item write when event append fails in the same transaction", () => {
    const beforeCount = svc.countWorkItems();
    const beforeSeq = latestEventSeq(svc.db);
    svc.db.prepare("DELETE FROM event_seq").run();
    expect(() => svc.createItem({ title: "Should roll back" }, actor, "ui")).toThrow();
    expect(svc.countWorkItems()).toBe(beforeCount);
    expect(latestEventSeq(svc.db)).toBe(beforeSeq);
  });

  it("does not emit an event when validation fails before the write", () => {
    const item = svc.createItem({ title: "Open" }, actor, "ui");
    const afterCreate = latestEventSeq(svc.db);
    expect(() => svc.reopen(item.id, actor)).toThrow(/Only done or cancelled/);
    expect(latestEventSeq(svc.db)).toBe(afterCreate);
    expect(svc.listEventsForItem(item.id).events).toHaveLength(1);
  });

  it("emits exactly one expected event type per mutation path", () => {
    const created = svc.createItem({ title: "Path" }, actor, "ui");
    expect(svc.listEventsForItem(created.id).events.map((e) => e.type)).toEqual([
      "created",
    ]);

    svc.updateItem(created.id, { title: "Path 2" }, actor);
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("updated");

    svc.updateItem(
      created.id,
      {
        reminder_at: "2026-10-10T12:00:00.000Z",
        reminder_intent: "check in",
      },
      actor,
    );
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("reminder_set");

    svc.updateItem(
      created.id,
      { assignee_type: "user", assignee_id: USER_ACTOR_ID },
      actor,
    );
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("assigned");

    svc.delegate(created.id, "agent-code", actor, "ui");
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("delegated");

    svc.setStatus(created.id, { status: "in_progress" }, actor, "ui");
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("status_changed");

    svc.askUser(created.id, "Need a decision please", actor, "ui");
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("status_changed");

    svc.complete(created.id, actor, "ui");
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("status_changed");

    svc.reopen(created.id, actor);
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("status_changed");

    const note = svc.createNote({ title: "N", body_md: "body" });
    svc.linkNote(created.id, note.id, "context");
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("note_linked");

    svc.unlinkNote(created.id, note.id);
    expect(
      svc.listEventsForItem(created.id).events.map((e) => e.type).at(-1),
    ).toBe("note_unlinked");
  });

  it("backfills one created event per existing item on migrate", () => {
    const rawPath = join(dir, "pre6.db");
    const raw = new DatabaseSync(rawPath);
    raw.exec("PRAGMA foreign_keys = ON;");
    raw.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE agents (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, monogram TEXT NOT NULL);
      INSERT INTO agents VALUES ('agent-code', 'Code', 'CO');
      CREATE TABLE work_items (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, goal TEXT, status TEXT NOT NULL,
        assignee_type TEXT NOT NULL, assignee_id TEXT, due_at TEXT, reminder_at TEXT,
        reminder_intent TEXT, priority TEXT NOT NULL, blocked_reason TEXT,
        needs_you_reason TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT,
        completed_by_type TEXT, completed_by_id TEXT, last_actor_type TEXT NOT NULL,
        last_actor_id TEXT NOT NULL, list_id TEXT
      );
      CREATE TABLE notes (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, body_md TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE item_note_links (
        item_id TEXT NOT NULL, note_id TEXT NOT NULL, role TEXT NOT NULL,
        PRIMARY KEY (item_id, note_id)
      );
      CREATE TABLE relay_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO relay_meta(key, value) VALUES ('sync_cursor', '1970-01-01T00:00:00.000Z');
      INSERT INTO schema_migrations(version, applied_at) VALUES (1, '2026-01-01T00:00:00.000Z');
      INSERT INTO schema_migrations(version, applied_at) VALUES (2, '2026-01-01T00:00:00.000Z');
      INSERT INTO schema_migrations(version, applied_at) VALUES (3, '2026-01-01T00:00:00.000Z');
      INSERT INTO schema_migrations(version, applied_at) VALUES (4, '2026-01-01T00:00:00.000Z');
      INSERT INTO schema_migrations(version, applied_at) VALUES (5, '2026-01-01T00:00:00.000Z');
      INSERT INTO work_items (
        id, title, goal, status, assignee_type, assignee_id, due_at, reminder_at,
        reminder_intent, priority, blocked_reason, needs_you_reason, source,
        created_at, updated_at, started_at, completed_at, completed_by_type,
        completed_by_id, last_actor_type, last_actor_id, list_id
      ) VALUES
      ('itm_aaaaaaaaaa', 'A', NULL, 'inbox', 'unassigned', NULL, NULL, NULL, NULL,
       'none', NULL, NULL, 'ui', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
       NULL, NULL, NULL, NULL, 'user', 'user', NULL),
      ('itm_bbbbbbbbbb', 'B', NULL, 'inbox', 'unassigned', NULL, NULL, NULL, NULL,
       'none', NULL, NULL, 'ui', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z',
       NULL, NULL, NULL, NULL, 'user', 'user', NULL);
    `);
    raw.close();

    const migrated = openDatabase(rawPath);
    const { events } = listItemEvents(migrated, { afterSeq: 0, limit: 100 });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === "created")).toBe(true);
    expect(events.every((e) => e.payload.backfill === 1)).toBe(true);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(latestEventSeq(migrated)).toBe(2);
    migrated.close();
  });

  it("pages after_seq correctly across limits", () => {
    for (let i = 0; i < 5; i += 1) {
      svc.createItem({ title: `P${i}` }, actor, "ui");
    }
    const page1 = svc.listChanges({ after_seq: 0, limit: 2 });
    expect(page1.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(page1.next_seq).toBe(2);
    expect(page1.has_more).toBe(true);

    const page2 = svc.listChanges({ after_seq: page1.next_seq, limit: 2 });
    expect(page2.events.map((e) => e.seq)).toEqual([3, 4]);
    expect(page2.has_more).toBe(true);

    const page3 = svc.listChanges({ after_seq: page2.next_seq, limit: 2 });
    expect(page3.events.map((e) => e.seq)).toEqual([5]);
    expect(page3.next_seq).toBe(5);
    expect(page3.has_more).toBe(false);
  });

  it("exposes seq on inbox and prefers after_seq delta", () => {
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
    expect(typeof snap.seq).toBe("number");
    expect(snap.seq).toBeGreaterThan(0);
    const cursorSeq = snap.seq ?? 0;

    const b = svc.createItem({ title: "Beta" }, actor, "ui");
    svc.delegate(b.id, "agent-code", actor, "ui");
    svc.askUser(
      b.id,
      "Need a decision on Beta",
      { type: "agent", id: "agent-code" },
      "mcp",
    );

    const delta = svc.inboxQuery("attention", { after_seq: cursorSeq });
    if (!("mode" in delta) || delta.mode !== "delta") {
      throw new Error("expected delta");
    }
    expect(delta.upserts.map((i) => i.id)).toContain(b.id);
    expect(delta.seq).toBeGreaterThan(cursorSeq);
  });
});
