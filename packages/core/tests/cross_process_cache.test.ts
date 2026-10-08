import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";
import { readSqliteDataVersion } from "../src/store/db.js";

/**
 * Simulates HTTP server + mcp:stdio / raw SQL on the same RELAY_DB:
 * two RelayService instances (separate in-process caches) share one file.
 */
describe("cross-process item cache (PRAGMA data_version)", () => {
  let dir: string;
  let dbPath: string;
  let http: RelayService;
  let stdio: RelayService;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };
  const agent = { type: "agent" as const, id: "grok-bot" };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-xproc-"));
    dbPath = join(dir, "relay.db");
    http = new RelayService({ dbPath });
    stdio = new RelayService({ dbPath });
  });

  afterEach(() => {
    http.close();
    stdio.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function warmHttp(): void {
    http.inboxQuery("all", { limit: 50 });
    http.search({ q: "warmup" });
  }

  async function waitVisible(
    check: () => boolean,
    label: string,
    budgetMs = 2000,
  ): Promise<number> {
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (check()) return performance.now() - t0;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`${label} not visible within ${budgetMs}ms`);
  }

  it("stdio create appears in HTTP search + inbox within AC3 budget", async () => {
    warmHttp();
    const title = `XPROC-CREATE-${Date.now()}`;
    const item = stdio.createItem({ title }, agent, "mcp");

    const ms = await waitVisible(() => {
      const search = http.search({ q: title });
      const inbox = http.inboxQuery("all", { limit: 50 });
      if ("mode" in inbox) return false;
      return (
        search.total > 0 &&
        search.items.some((r) => r.item.id === item.id) &&
        inbox.total_count >= 1 &&
        inbox.items.some((i) => i.id === item.id)
      );
    }, "stdio create");
    expect(ms).toBeLessThanOrEqual(2000);
  });

  it("stdio complete removes from Todo and shows up in delta removed_ids", async () => {
    warmHttp();
    const item = http.createItem({ title: "XPROC-COMPLETE" }, actor, "ui");
    warmHttp();
    const snap = http.inboxQuery("all", { limit: 1 });
    if ("mode" in snap) throw new Error("expected snapshot");
    const since = snap.sync_cursor ?? "";

    stdio.complete(item.id, agent, "mcp");

    await waitVisible(() => http.getItem(item.id).status === "done", "complete byId");

    const delta = http.inboxQuery("all", { since });
    if (!("mode" in delta) || delta.mode !== "delta") {
      throw new Error("expected delta");
    }
    expect(delta.removed_ids).toContain(item.id);
    const page = http.inboxQuery("all", { limit: 200 });
    if ("mode" in page) throw new Error("expected snapshot");
    expect(page.items.some((i) => i.id === item.id)).toBe(false);
  });

  it("stdio needs_you appears in Atención search/inbox", async () => {
    warmHttp();
    const item = stdio.createItem({ title: "XPROC-NEED" }, agent, "mcp");
    stdio.delegate(item.id, "grok-bot", agent, "mcp");
    stdio.askUser(item.id, "Need a decision now please", agent, "mcp");

    await waitVisible(() => {
      const search = http.search({ q: "XPROC-NEED" });
      const hit = search.items.find((r) => r.item.id === item.id);
      const inbox = http.inboxQuery("attention", { limit: 200 });
      if ("mode" in inbox) return false;
      return (
        hit?.item.status === "needs_you" &&
        inbox.items.some((i) => i.id === item.id)
      );
    }, "needs_you");
  });

  it("stdio note edit is searchable via FTS from HTTP", async () => {
    const note = http.createNote({
      title: "XPROC-NOTE",
      body_md: "alpha body",
    });
    warmHttp();
    const marker = `NOTEEDIT-${Date.now()}`;
    stdio.updateNote(note.id, { body_md: `updated ${marker}` });

    await waitVisible(() => {
      const orphans = http.searchOrphanNotes(marker);
      return orphans.total > 0 && orphans.notes.some((n) => n.note.id === note.id);
    }, "note edit FTS");
  });

  it("raw SQL title update is visible in HTTP search (FTS trigger + cache drop)", async () => {
    const item = http.createItem({ title: "BEFORE-SQL" }, actor, "ui");
    warmHttp();
    const vBefore = readSqliteDataVersion(http.db);
    const direct = new DatabaseSync(dbPath);
    const marker = `SQL-STALE-${Date.now()}`;
    const at = new Date().toISOString();
    direct
      .prepare(
        `UPDATE work_items SET title = ?, updated_at = ? WHERE id = ?`,
      )
      .run(marker, at, item.id);
    direct.close();
    expect(readSqliteDataVersion(http.db)).toBeGreaterThan(vBefore);

    await waitVisible(() => {
      const search = http.search({ q: marker });
      return search.items.some(
        (r) => r.item.id === item.id && r.item.title === marker,
      );
    }, "sql title");
  });
});
