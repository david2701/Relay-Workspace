import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConflictError, RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { invokeMcpTool } from "../src/mcp/http.js";

describe("AC1 web-API vs MCP create parity", () => {
  let dir: string;
  let svc: RelayService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-srv-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    app = createApp(svc, "http://127.0.0.1:7421");
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates identical canonical fields via HTTP UI and MCP tool", async () => {
    const res = await app.request("http://127.0.0.1/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Source": "ui",
      },
      body: JSON.stringify({ title: "Paridad UI" }),
    });
    expect(res.status).toBe(201);
    const uiJson = (await res.json()) as { item: Record<string, unknown> };
    const mcpResult = (await invokeMcpTool(
      svc,
      "items_create",
      {
        title: "Paridad MCP",
        actor: { id: "grok-bot", type: "agent" },
      },
      "grok-bot",
    )) as { item: Record<string, unknown> };

    const uiKeys = Object.keys(uiJson.item).sort();
    const mcpKeys = Object.keys(mcpResult.item).sort();
    expect(mcpKeys).toEqual(uiKeys);
    expect(uiJson.item.status).toBe("inbox");
    expect(uiJson.item.source).toBe("ui");
    expect(uiJson.item.last_actor_id).toBe(USER_ACTOR_ID);
    expect(mcpResult.item.source).toBe("mcp");
    expect(mcpResult.item.last_actor_id).toBe("grok-bot");
    expect(mcpResult.item.last_actor_type).toBe("agent");
  });

  it("binds only local CORS origins", async () => {
    const res = await app.request("http://127.0.0.1/api/health", {
      headers: { Origin: "http://127.0.0.1:7421" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:7421",
    );
    const bad = await app.request("http://127.0.0.1/api/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("API–MCP pagination, search, sync parity", () => {
  let dir: string;
  let svc: RelayService;
  let app: ReturnType<typeof createApp>;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-parity-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    app = createApp(svc, "http://127.0.0.1:7421");
    for (let i = 0; i < 5; i += 1) {
      svc.createItem({ title: `Item ${i}` }, actor, "ui");
    }
    svc.createNote({ title: "Nota A", body_md: "cuerpo alpha buscable" });
    svc.createNote({ title: "Nota B", body_md: "cuerpo beta" });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("items pagination pages are identical via API and MCP", async () => {
    const httpRes = await app.request("http://127.0.0.1/api/items?limit=2");
    expect(httpRes.status).toBe(200);
    const httpPage = (await httpRes.json()) as {
      items: Array<{ id: string }>;
      next_cursor: string | null;
      has_more: boolean;
      total_count: number;
    };
    const mcpPage = (await invokeMcpTool(svc, "items_list", {
      limit: 2,
    })) as typeof httpPage;

    expect(mcpPage).toEqual(httpPage);
    expect(httpPage.items).toHaveLength(2);
    expect(httpPage.has_more).toBe(true);
    expect(httpPage.total_count).toBe(5);
    expect(httpPage.next_cursor).toBeTruthy();

    const http2 = await app.request(
      `http://127.0.0.1/api/items?limit=2&cursor=${encodeURIComponent(httpPage.next_cursor ?? "")}`,
    );
    const httpPage2 = await http2.json();
    const mcpPage2 = await invokeMcpTool(svc, "items_list", {
      limit: 2,
      cursor: httpPage.next_cursor,
    });
    expect(mcpPage2).toEqual(httpPage2);
  });

  it("notes pagination pages are identical via API and MCP", async () => {
    const httpRes = await app.request("http://127.0.0.1/api/notes?limit=1");
    const httpPage = await httpRes.json();
    const mcpPage = await invokeMcpTool(svc, "notes_list", { limit: 1 });
    expect(mcpPage).toEqual(httpPage);
  });

  it("search results are identical via API and MCP", async () => {
    const needle = svc.createItem(
      { title: "Needle único", goal: "encontrar esto" },
      actor,
      "ui",
    );
    const httpRes = await app.request(
      "http://127.0.0.1/api/search?q=Needle&limit=10",
    );
    expect(httpRes.status).toBe(200);
    const httpSearch = await httpRes.json();
    const mcpSearch = await invokeMcpTool(svc, "search", {
      q: "Needle",
      limit: 10,
    });
    expect(mcpSearch).toEqual(httpSearch);
    expect(
      (httpSearch as { items: Array<{ item: { id: string } }> }).items.some(
        (h) => h.item.id === needle.id,
      ),
    ).toBe(true);
  });

  it("inbox sync since is identical via API and MCP", async () => {
    const item = svc.createItem({ title: "Attention" }, actor, "ui");
    svc.delegate(item.id, "grok-bot", actor, "ui");
    svc.askUser(
      item.id,
      "Need a decision please",
      { type: "agent", id: "grok-bot" },
      "mcp",
    );

    const snapRes = await app.request(
      "http://127.0.0.1/api/inbox?view=attention",
    );
    const snap = (await snapRes.json()) as { sync_cursor?: string | null };
    const since = snap.sync_cursor;
    expect(since).toBeTruthy();

    const next = svc.createItem({ title: "Newer attention" }, actor, "ui");
    svc.delegate(next.id, "grok-bot", actor, "ui");
    svc.askUser(
      next.id,
      "Need another decision",
      { type: "agent", id: "grok-bot" },
      "mcp",
    );

    const httpDeltaRes = await app.request(
      `http://127.0.0.1/api/inbox?view=attention&since=${encodeURIComponent(since ?? "")}`,
    );
    expect(httpDeltaRes.status).toBe(200);
    const httpDelta = (await httpDeltaRes.json()) as Record<string, unknown>;
    const mcpDelta = (await invokeMcpTool(svc, "inbox_query", {
      view: "attention",
      since,
    })) as Record<string, unknown>;
    // server_time / sync_cursor are stamped per call; compare stable fields.
    const {
      server_time: httpTime,
      sync_cursor: httpCursor,
      ...httpRest
    } = httpDelta;
    const {
      server_time: mcpTime,
      sync_cursor: mcpCursor,
      ...mcpRest
    } = mcpDelta;
    expect(httpTime).toBeTruthy();
    expect(mcpTime).toBeTruthy();
    expect(httpCursor).toBeTruthy();
    expect(mcpCursor).toBeTruthy();
    expect(mcpRest).toEqual(httpRest);
    expect(httpDelta.mode).toBe("delta");
    expect(
      (httpDelta.upserts as Array<{ id: string }>).map((u) => u.id),
    ).toContain(next.id);
  });

  it("notes_search finds orphan notes", async () => {
    const orphan = svc.createNote({
      title: "Huérfana",
      body_md: "palabra unicórnio suelta",
    });
    const linkedItem = svc.createItem({ title: "Con nota" }, actor, "ui");
    const linked = svc.createNote({
      title: "Vinculada",
      body_md: "también unicórnio",
    });
    svc.linkNote(linkedItem.id, linked.id);

    const mcp = (await invokeMcpTool(svc, "notes_search", {
      q: "unicornio",
      limit: 10,
    })) as { notes: Array<{ note: { id: string } }>; total: number };
    expect(mcp.notes.map((n) => n.note.id)).toContain(orphan.id);
    expect(mcp.notes.every((n) => n.note.id !== linked.id)).toBe(true);

    const http = (await (
      await app.request("http://127.0.0.1/api/notes/search?q=unicornio&limit=10")
    ).json()) as { notes: Array<{ note: { id: string } }>; total: number };
    expect(http.notes.map((n) => n.note.id)).toEqual(
      mcp.notes.map((n) => n.note.id),
    );
  });
});

describe("note PATCH conflict 409", () => {
  let dir: string;
  let svc: RelayService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-conflict-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    app = createApp(svc, "http://127.0.0.1:7421");
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns 409 with current_updated_at when if_updated_at is stale", async () => {
    const note = svc.createNote({ title: "N", body_md: "a" });
    const stale = note.updated_at;
    svc.updateNote(note.id, { body_md: "b" }, { if_updated_at: stale });
    const current = svc.getNote(note.id);

    const res = await app.request(`http://127.0.0.1/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body_md: "c",
        if_updated_at: stale,
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: { code: string; message: string; current_updated_at: string };
    };
    expect(body.error.code).toBe("conflict");
    expect(body.error.current_updated_at).toBe(current.updated_at);
    expect(body.error.message).toMatch(/modified/i);
  });

  it("MCP notes_update throws ConflictError on stale if_updated_at", async () => {
    const note = svc.createNote({ title: "N", body_md: "a" });
    const stale = note.updated_at;
    svc.updateNote(note.id, { body_md: "b" }, { if_updated_at: stale });
    await expect(
      invokeMcpTool(svc, "notes_update", {
        id: note.id,
        body_md: "c",
        if_updated_at: stale,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
