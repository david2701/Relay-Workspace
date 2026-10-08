import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dateOnlyParisIso } from "../src/domain/paris_time.js";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";

describe("FTS5 search", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-search-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("matches accents without diacritics and ranks title first", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    const titled = svc.createItem({ title: "Démo grabada" }, actor, "ui");
    svc.createItem(
      { title: "Other", goal: "texto con demo escondida" },
      actor,
      "ui",
    );
    const hits = svc.search({ q: "demo" });
    expect(hits.total).toBeGreaterThanOrEqual(2);
    expect(hits.items[0]?.item.id).toBe(titled.id);
    expect(hits.items[0]?.match.field).toBe("title");
  });

  it("ANDs query words and ORs status; needs_you maps actor to david", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    const need = svc.createItem(
      { title: "Café briefing" },
      actor,
      "ui",
    );
    svc.delegate(need.id, "agent-code", actor, "ui");
    svc.askUser(
      need.id,
      "Elegir titular del café",
      { type: "agent", id: "agent-code" },
      "mcp",
    );
    const blocked = svc.createItem(
      { title: "Café bloqueado" },
      actor,
      "ui",
    );
    svc.delegate(blocked.id, "agent-research", actor, "ui");
    svc.setStatus(
      blocked.id,
      { status: "blocked", blocked_reason: "falta acceso café" },
      { type: "agent", id: "agent-research" },
      "mcp",
    );
    svc.createItem({ title: "Café inbox only" }, actor, "ui");

    const andHits = svc.search({ q: "cafe briefing" });
    expect(andHits.items.map((h) => h.item.id)).toContain(need.id);
    expect(andHits.items.every((h) => h.item.id !== blocked.id)).toBe(true);

    const statusHits = svc.search({
      q: "cafe",
      status: ["blocked", "needs_you"],
    });
    const statusIds = new Set(statusHits.items.map((h) => h.item.id));
    expect(statusIds.has(need.id)).toBe(true);
    expect(statusIds.has(blocked.id)).toBe(true);

    const davidHits = svc.search({ q: "cafe", actor: ["david"] });
    expect(davidHits.items.map((h) => h.item.id)).toContain(need.id);
    expect(davidHits.items.every((h) => h.item.id !== blocked.id)).toBe(true);

    const grokHits = svc.search({ q: "cafe", actor: ["agent-code"] });
    expect(grokHits.items.every((h) => h.item.id !== need.id)).toBe(true);
  });

  it("due facet uses Paris day bounds", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    svc.updateSettings({ timezone: "Europe/Paris" });
    const now = new Date("2026-10-08T07:19:00.000Z");
    const today = svc.createItem(
      { title: "Due today", due_at: dateOnlyParisIso(2026, 10, 8) },
      actor,
      "ui",
    );
    svc.createItem(
      { title: "Due next week", due_at: dateOnlyParisIso(2026, 10, 15) },
      actor,
      "ui",
    );
    const hits = svc.search({ due: "today" }, now);
    expect(hits.items.map((h) => h.item.id)).toEqual([today.id]);
  });

  it("finds linked note matches and orphan notes separately", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    const item = svc.createItem({ title: "Sin keyword" }, actor, "ui");
    const linked = svc.createNote({
      title: "Brief",
      body_md: "Contiene la palabra **unicórnio** aquí",
    });
    svc.linkNote(item.id, linked.id);
    const orphan = svc.createNote({
      title: "Orphan",
      body_md: "También unicórnio en nota huérfana",
    });

    const itemHits = svc.search({ q: "unicornio" });
    expect(itemHits.items.map((h) => h.item.id)).toContain(item.id);
    expect(itemHits.items[0]?.match.field).toBe("note");
    expect(itemHits.items[0]?.match.note_id).toBe(linked.id);

    const orphans = svc.searchOrphanNotes("unicornio");
    expect(orphans.notes.map((n) => n.note.id)).toContain(orphan.id);
    expect(orphans.notes.every((n) => n.note.id !== linked.id)).toBe(true);
  });

  it("FTS smoke at modest scale", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    for (let i = 0; i < 200; i += 1) {
      svc.createItem(
        {
          title: i === 42 ? "Needle in haystack" : `Bulk item ${i}`,
          goal: i === 42 ? null : `goal ${i}`,
        },
        actor,
        "ui",
      );
    }
    const hits = svc.search({ q: "needle haystack" });
    expect(hits.total).toBe(1);
    expect(hits.items[0]?.match.field).toBe("title");
  });

  it("updateNote if_updated_at conflicts", () => {
    const note = svc.createNote({ title: "N", body_md: "a" });
    svc.updateNote(note.id, { body_md: "b" }, { if_updated_at: note.updated_at });
    expect(() =>
      svc.updateNote(note.id, { body_md: "c" }, { if_updated_at: note.updated_at }),
    ).toThrow(/conflict|modified/i);
  });
});
