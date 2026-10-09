import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "../src/domain/errors.js";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";
import { latestEventSeq } from "../src/store/event_log.js";
import {
  cleanupExpiredIdempotencyKeys,
  hashRequestBody,
  lookupIdempotencyKey,
  storeIdempotencyKey,
} from "../src/store/idempotency.js";

describe("answer + take", () => {
  let dir: string;
  let svc: RelayService;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-answer-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function needsYouItem() {
    const item = svc.createItem(
      {
        title: "Need decision",
        assignee_type: "agent",
        assignee_id: "agent-code",
      },
      actor,
      "ui",
    );
    return svc.askUser(item.id, "¿Lanzamos el viernes?", actor, "ui");
  }

  it("answer creates exactly one note + answered (+ status_changed when returning)", () => {
    const item = needsYouItem();
    const beforeNotes = svc.listNotes().length;
    const beforeEvents = svc.listEventsForItem(item.id).events.length;
    const result = svc.answer(
      item.id,
      { text: "Sí, viernes.", return_to: "agent" },
      actor,
      "ui",
    );
    expect(result.note.body_md).toBe("Sí, viernes.");
    expect(result.item.status).toBe("assigned");
    expect(result.item.assignee_id).toBe("agent-code");
    expect(svc.listNotes()).toHaveLength(beforeNotes + 1);
    const links = svc.linksForItem(item.id);
    expect(links).toEqual([
      { item_id: item.id, note_id: result.note.id, role: "decision" },
    ]);
    const types = svc
      .listEventsForItem(item.id)
      .events.slice(beforeEvents)
      .map((e) => e.type);
    expect(types).toEqual(["answered", "status_changed"]);
    const answered = svc.listEventsForItem(item.id).events.find((e) => e.type === "answered");
    expect(answered?.payload).toMatchObject({
      note_id: result.note.id,
      text: "Sí, viernes.",
    });
    expect(result.seq).toBe(latestEventSeq(svc.db));
  });

  it("answer with return_to none keeps needs_you and only emits answered", () => {
    const item = needsYouItem();
    const beforeEvents = svc.listEventsForItem(item.id).events.length;
    const result = svc.answer(
      item.id,
      { text: "Hold for now.", return_to: "none" },
      actor,
      "ui",
    );
    expect(result.item.status).toBe("needs_you");
    const types = svc
      .listEventsForItem(item.id)
      .events.slice(beforeEvents)
      .map((e) => e.type);
    expect(types).toEqual(["answered"]);
  });

  it("answer rolls back note + events when append fails", () => {
    const item = needsYouItem();
    const beforeNotes = svc.listNotes().length;
    const beforeLinks = svc.linksForItem(item.id).length;
    const beforeSeq = latestEventSeq(svc.db);
    svc.db.prepare("DELETE FROM event_seq").run();
    expect(() =>
      svc.answer(item.id, { text: "Should vanish", return_to: "agent" }, actor, "ui"),
    ).toThrow();
    expect(svc.listNotes()).toHaveLength(beforeNotes);
    expect(svc.linksForItem(item.id)).toHaveLength(beforeLinks);
    expect(svc.getItem(item.id).status).toBe("needs_you");
    expect(latestEventSeq(svc.db)).toBe(beforeSeq);
  });

  it("take assigns user + in_progress and emits taken", () => {
    const item = needsYouItem();
    const beforeEvents = svc.listEventsForItem(item.id).events.length;
    const result = svc.take(item.id, actor, "ui");
    expect(result.item.status).toBe("in_progress");
    expect(result.item.assignee_type).toBe("user");
    expect(result.item.assignee_id).toBe(USER_ACTOR_ID);
    const types = svc
      .listEventsForItem(item.id)
      .events.slice(beforeEvents)
      .map((e) => e.type);
    expect(types).toEqual(["taken"]);
    expect(result.seq).toBe(latestEventSeq(svc.db));
  });

  it("take is atomic on failure injection", () => {
    const item = needsYouItem();
    const beforeSeq = latestEventSeq(svc.db);
    svc.db.prepare("DELETE FROM event_seq").run();
    expect(() => svc.take(item.id, actor, "ui")).toThrow();
    expect(svc.getItem(item.id).status).toBe("needs_you");
    expect(svc.getItem(item.id).assignee_type).toBe("agent");
    expect(latestEventSeq(svc.db)).toBe(beforeSeq);
  });

  it("take on done/cancelled returns ConflictError with item", () => {
    const item = svc.createItem({ title: "Done soon" }, actor, "ui");
    svc.complete(item.id, actor, "ui");
    expect(() => svc.take(item.id, actor, "ui")).toThrow(ConflictError);
    try {
      svc.take(item.id, actor, "ui");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).item).toMatchObject({
        id: item.id,
        status: "done",
      });
    }
  });

  it("two concurrent takes: one success and one idempotent", async () => {
    const item = needsYouItem();
    const results = await Promise.all([
      Promise.resolve(svc.take(item.id, actor, "ui")),
      Promise.resolve(svc.take(item.id, actor, "ui")),
    ]);
    expect(results[0]?.item.status).toBe("in_progress");
    expect(results[1]?.item.status).toBe("in_progress");
    const taken = svc
      .listEventsForItem(item.id)
      .events.filter((e) => e.type === "taken");
    expect(taken).toHaveLength(1);
  });

  it("if_updated_at mismatch on answer/take/update/status yields ConflictError with item", () => {
    const item = needsYouItem();
    const stale = item.updated_at;
    svc.updateItem(item.id, { title: "Touched" }, actor);
    const current = svc.getItem(item.id);
    expect(() =>
      svc.answer(
        item.id,
        { text: "Nope", return_to: "none" },
        actor,
        "ui",
        { if_updated_at: stale },
      ),
    ).toThrow(ConflictError);
    expect(() =>
      svc.take(item.id, actor, "ui", { if_updated_at: stale }),
    ).toThrow(ConflictError);
    expect(() =>
      svc.updateItem(item.id, { title: "X" }, actor, { if_updated_at: stale }),
    ).toThrow(ConflictError);
    expect(() =>
      svc.setStatus(
        item.id,
        { status: "in_progress" },
        actor,
        "ui",
        { if_updated_at: stale },
      ),
    ).toThrow(ConflictError);
    try {
      svc.take(item.id, actor, "ui", { if_updated_at: stale });
    } catch (err) {
      expect((err as ConflictError).item).toMatchObject({
        id: current.id,
        updated_at: current.updated_at,
      });
    }
  });

  it("context_get shows the answer decision note", () => {
    const item = needsYouItem();
    svc.answer(
      item.id,
      { text: "Go ahead.", return_to: "agent" },
      actor,
      "ui",
    );
    const pack = svc.getContextWithEvents(item.id);
    const decision = pack.context.notes.find((n) => n.role === "decision");
    expect(decision?.body_md).toBe("Go ahead.");
    expect(pack.events.some((e) => e.type === "answered")).toBe(true);
  });
});

describe("idempotency store", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-idem-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lookup returns stored row and expires after 24h", () => {
    const body_hash = hashRequestBody('{"text":"a"}');
    const created = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    storeIdempotencyKey(svc.db, {
      key: "k1",
      method: "POST",
      path: "/api/items/itm_x/answer",
      body_hash,
      status_code: 200,
      response_body: '{"ok":true}',
      created_at: created,
    });
    expect(
      lookupIdempotencyKey(svc.db, {
        key: "k1",
        method: "POST",
        path: "/api/items/itm_x/answer",
      }),
    ).toBeNull();
    storeIdempotencyKey(svc.db, {
      key: "k2",
      method: "POST",
      path: "/api/items/itm_x/take",
      body_hash,
      status_code: 200,
      response_body: '{"ok":true}',
    });
    const hit = lookupIdempotencyKey(svc.db, {
      key: "k2",
      method: "POST",
      path: "/api/items/itm_x/take",
    });
    expect(hit?.response_body).toBe('{"ok":true}');
    const deleted = cleanupExpiredIdempotencyKeys(
      svc.db,
      new Date(Date.now() + 25 * 60 * 60 * 1000),
    );
    expect(deleted).toBeGreaterThanOrEqual(1);
  });
});
