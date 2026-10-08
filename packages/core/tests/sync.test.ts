import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    svc.delegate(a.id, "grok-bot", actor, "ui");
    svc.askUser(
      a.id,
      "Need a decision on Alpha",
      { type: "agent", id: "grok-bot" },
      "mcp",
    );
    const snap = svc.inboxQuery("attention");
    if ("mode" in snap) throw new Error("expected snapshot");
    const since = snap.sync_cursor;
    expect(since).toBeTruthy();

    const b = svc.createItem({ title: "Beta" }, actor, "ui");
    svc.delegate(b.id, "grok-bot", actor, "ui");
    svc.askUser(
      b.id,
      "Need a decision on Beta",
      { type: "agent", id: "grok-bot" },
      "mcp",
    );

    // Move Alpha out of attention (needs_you → assigned)
    svc.setStatus(
      a.id,
      { status: "assigned" },
      { type: "agent", id: "grok-bot" },
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
    const since = first.updated_at;
    const second = svc.createItem({ title: "Second" }, actor, "ui");
    const page = svc.listItems({ limit: 100 });
    expect(page.meta.total_count).toBe(2);
    const newer = page.items.filter((i) => i.updated_at > since);
    expect(newer.map((i) => i.id)).toEqual([second.id]);
  });
});
