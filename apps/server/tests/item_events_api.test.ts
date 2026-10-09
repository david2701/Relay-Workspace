import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { invokeMcpTool } from "../src/mcp/http.js";

describe("item events HTTP + MCP", () => {
  let dir: string;
  let svc: RelayService;
  let app: ReturnType<typeof createApp>;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-events-api-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    app = createApp(svc, "http://127.0.0.1:7421");
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/items/:id/events returns history and 404 for unknown item", async () => {
    const item = svc.createItem({ title: "Hist" }, actor, "ui");
    svc.updateItem(item.id, { title: "Hist 2" }, actor);

    const res = await app.request(
      `http://127.0.0.1/api/items/${item.id}/events?after_seq=0&limit=10`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      events: Array<{ type: string; seq: number }>;
      next_seq: number;
      has_more: boolean;
    };
    expect(body.events.map((e) => e.type)).toEqual(["created", "updated"]);
    expect(body.events[0]?.seq).toBeLessThan(body.events[1]?.seq ?? 0);
    expect(body.has_more).toBe(false);

    const missing = await app.request(
      "http://127.0.0.1/api/items/itm_zzzzzzzzzz/events",
    );
    expect(missing.status).toBe(404);
  });

  it("GET /api/changes pages with has_more", async () => {
    for (let i = 0; i < 3; i += 1) {
      svc.createItem({ title: `C${i}` }, actor, "ui");
    }
    const page1 = await app.request(
      "http://127.0.0.1/api/changes?after_seq=0&limit=2",
    );
    expect(page1.status).toBe(200);
    const body1 = (await page1.json()) as {
      events: Array<{ seq: number }>;
      next_seq: number;
      has_more: boolean;
    };
    expect(body1.events).toHaveLength(2);
    expect(body1.has_more).toBe(true);
    expect(body1.next_seq).toBe(2);

    const page2 = await app.request(
      `http://127.0.0.1/api/changes?after_seq=${body1.next_seq}&limit=2`,
    );
    const body2 = (await page2.json()) as {
      events: Array<{ seq: number }>;
      has_more: boolean;
    };
    expect(body2.events).toHaveLength(1);
    expect(body2.has_more).toBe(false);
  });

  it("inbox includes seq and MCP items_events / changes_list match HTTP", async () => {
    const item = svc.createItem({ title: "Parity" }, actor, "ui");
    const inboxRes = await app.request("http://127.0.0.1/api/inbox?view=all&limit=5");
    const inbox = (await inboxRes.json()) as { seq: number };
    expect(inbox.seq).toBeGreaterThan(0);

    const httpEvents = await (
      await app.request(`http://127.0.0.1/api/items/${item.id}/events`)
    ).json();
    const mcpEvents = await invokeMcpTool(svc, "items_events", {
      id: item.id,
    });
    expect(mcpEvents).toEqual(httpEvents);

    const httpChanges = await (
      await app.request("http://127.0.0.1/api/changes?after_seq=0&limit=50")
    ).json();
    const mcpChanges = await invokeMcpTool(svc, "changes_list", {
      after_seq: 0,
      limit: 50,
    });
    expect(mcpChanges).toEqual(httpChanges);

    const ctx = (await invokeMcpTool(svc, "context_get", {
      id: item.id,
    })) as { events: unknown[]; context: { item_id: string } };
    expect(ctx.context.item_id).toBe(item.id);
    expect(Array.isArray(ctx.events)).toBe(true);
    expect(ctx.events.length).toBeGreaterThan(0);
  });
});
