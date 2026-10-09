import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { RelayService, USER_ACTOR_ID, ValidationError } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { invokeMcpTool } from "../src/mcp/http.js";
import { seedIntoService } from "../src/seed/demo_seed.js";

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
    // next_seq is the last seq on THIS item's page (not global watermark).
    expect(body.next_seq).toBe(body.events[body.events.length - 1]?.seq);

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

  const badCases: Array<{ query: string; label: string }> = [
    { query: "after_seq=-1", label: "after_seq=-1" },
    { query: "after_seq=abc", label: "after_seq=abc" },
    { query: "limit=0", label: "limit=0" },
    { query: "limit=-1", label: "limit=-1" },
    { query: "limit=99999", label: "limit=99999" },
    {
      query: "after_seq=999999999999999999999",
      label: "after_seq=huge",
    },
  ];

  for (const { query, label } of badCases) {
    it(`GET /api/changes returns 400 for ${label}`, async () => {
      const res = await app.request(`http://127.0.0.1/api/changes?${query}`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("validation_error");
      expect(typeof body.message).toBe("string");
      expect(body.message.length).toBeGreaterThan(0);
    });

    it(`GET /api/items/:id/events returns 400 for ${label}`, async () => {
      const item = svc.createItem({ title: `bad-${label}` }, actor, "ui");
      const res = await app.request(
        `http://127.0.0.1/api/items/${item.id}/events?${query}`,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("validation_error");
      expect(body.message.length).toBeGreaterThan(0);
    });

    it(`GET /api/inbox returns 400 for ${label}`, async () => {
      const res = await app.request(
        `http://127.0.0.1/api/inbox?view=all&${query}`,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("validation_error");
      expect(body.message.length).toBeGreaterThan(0);
    });
  }

  const mcpBad: Array<{ args: Record<string, unknown>; label: string }> = [
    { args: { after_seq: -1 }, label: "after_seq=-1" },
    { args: { after_seq: "abc" }, label: "after_seq=abc" },
    { args: { limit: 0 }, label: "limit=0" },
    { args: { limit: -1 }, label: "limit=-1" },
    { args: { limit: 99999 }, label: "limit=99999" },
    {
      args: { after_seq: Number.MAX_SAFE_INTEGER + 1 },
      label: "after_seq=huge",
    },
  ];

  for (const { args, label } of mcpBad) {
    it(`MCP changes_list rejects ${label}`, async () => {
      await expect(invokeMcpTool(svc, "changes_list", args)).rejects.toThrow(
        ValidationError,
      );
    });

    it(`MCP items_events rejects ${label}`, async () => {
      const item = svc.createItem({ title: `mcp-${label}` }, actor, "ui");
      await expect(
        invokeMcpTool(svc, "items_events", { id: item.id, ...args }),
      ).rejects.toThrow(ValidationError);
    });

    it(`MCP inbox_query rejects ${label}`, async () => {
      await expect(
        invokeMcpTool(svc, "inbox_query", { view: "all", ...args }),
      ).rejects.toThrow(ValidationError);
    });
  }

  it("demo seed emits updated(demo_backdate) instead of raw UPDATE", () => {
    seedIntoService(svc, "en", { applyDemoProfile: false });
    const changes = svc.listChanges({ after_seq: 0, limit: 200 });
    const backdate = changes.events.filter(
      (e) =>
        e.type === "updated" &&
        (e.payload as { reason?: string }).reason === "demo_backdate",
    );
    expect(backdate.length).toBe(1);
    expect(backdate[0]?.payload).toMatchObject({
      changed: ["updated_at"],
      reason: "demo_backdate",
    });
  });

  it("200 parallel HTTP creates yield contiguous unique seq", async () => {
    const port = 18000 + Math.floor(Math.random() * 1000);
    const server = await new Promise<ReturnType<typeof serve>>((resolve, reject) => {
      const s = serve(
        { fetch: app.fetch, hostname: "127.0.0.1", port },
        () => resolve(s),
      );
      s.on("error", reject);
    });
    try {
      const responses = await Promise.all(
        Array.from({ length: 200 }, (_, i) =>
          fetch(`http://127.0.0.1:${port}/api/items`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Relay-Source": "ui",
            },
            body: JSON.stringify({ title: `HTTP-${i}` }),
          }),
        ),
      );
      expect(responses.every((r) => r.status === 201)).toBe(true);
      const page = svc.listChanges({ after_seq: 0, limit: 200 });
      expect(page.events).toHaveLength(200);
      const seqs = page.events.map((e) => e.seq);
      expect(new Set(seqs).size).toBe(200);
      expect(Math.min(...seqs)).toBe(1);
      expect(Math.max(...seqs)).toBe(200);
      for (let i = 1; i < seqs.length; i += 1) {
        expect(seqs[i]).toBe((seqs[i - 1] ?? 0) + 1);
      }
    } finally {
      server.close();
    }
  });
});
