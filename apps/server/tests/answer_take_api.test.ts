import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { invokeMcpTool } from "../src/mcp/http.js";

describe("answer / take / idempotency HTTP", () => {
  let dir: string;
  let svc: RelayService;
  let app: ReturnType<typeof createApp>;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-answer-api-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    app = createApp(svc, "http://127.0.0.1:7421");
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function seedNeedsYou(): Promise<string> {
    const item = svc.createItem(
      {
        title: "Decide",
        assignee_type: "agent",
        assignee_id: "agent-code",
      },
      actor,
      "ui",
    );
    svc.askUser(item.id, "Ship Friday?", actor, "ui");
    return item.id;
  }

  it("POST answer returns item, note, seq and emits events", async () => {
    const id = await seedNeedsYou();
    const res = await app.request(`http://127.0.0.1/api/items/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Source": "ui" },
      body: JSON.stringify({ text: "Yes Friday", return_to: "agent" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      item: { status: string; id: string };
      note: { id: string; body_md: string };
      seq: number;
    };
    expect(body.item.status).toBe("assigned");
    expect(body.note.body_md).toBe("Yes Friday");
    expect(body.seq).toBeGreaterThan(0);
    const events = svc.listEventsForItem(id).events.map((e) => e.type);
    expect(events.filter((t) => t === "answered")).toHaveLength(1);
    expect(events.at(-1)).toBe("status_changed");
  });

  it("POST take returns item + seq; 409 on done", async () => {
    const id = await seedNeedsYou();
    const res = await app.request(`http://127.0.0.1/api/items/${id}/take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Source": "ui" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      item: { status: string; assignee_type: string };
      seq: number;
    };
    expect(body.item.status).toBe("in_progress");
    expect(body.item.assignee_type).toBe("user");

    const other = svc.createItem({ title: "X" }, actor, "ui");
    svc.complete(other.id, actor, "ui");
    const conflict = await app.request(
      `http://127.0.0.1/api/items/${other.id}/take`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    expect(conflict.status).toBe(409);
    const err = (await conflict.json()) as {
      error: { item: { status: string } };
    };
    expect(err.error.item.status).toBe("done");
  });

  it("if_updated_at mismatch returns 409 with item on answer/take/patch/status", async () => {
    const id = await seedNeedsYou();
    const stale = svc.getItem(id).updated_at;
    svc.updateItem(id, { title: "Bump" }, actor);
    const cases: Array<{ method: string; path: string; body: unknown }> = [
      {
        method: "POST",
        path: `/api/items/${id}/answer`,
        body: { text: "x", return_to: "none", if_updated_at: stale },
      },
      {
        method: "POST",
        path: `/api/items/${id}/take`,
        body: { if_updated_at: stale },
      },
      {
        method: "PATCH",
        path: `/api/items/${id}`,
        body: { title: "y", if_updated_at: stale },
      },
      {
        method: "POST",
        path: `/api/items/${id}/status`,
        body: { status: "in_progress", if_updated_at: stale },
      },
    ];
    for (const row of cases) {
      const res = await app.request(`http://127.0.0.1${row.path}`, {
        method: row.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.body),
      });
      expect(res.status).toBe(409);
      const err = (await res.json()) as { error: { item: { id: string } } };
      expect(err.error.item.id).toBe(id);
    }
  });

  it("Idempotency-Key replays same body and 422 on different body", async () => {
    const id = await seedNeedsYou();
    const headers = {
      "Content-Type": "application/json",
      "X-Relay-Source": "ui",
      "Idempotency-Key": "ans-1",
    };
    const body = JSON.stringify({ text: "Replay me", return_to: "agent" });
    const first = await app.request(`http://127.0.0.1/api/items/${id}/answer`, {
      method: "POST",
      headers,
      body,
    });
    expect(first.status).toBe(200);
    const firstJson = await first.json();
    const second = await app.request(`http://127.0.0.1/api/items/${id}/answer`, {
      method: "POST",
      headers,
      body,
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstJson);
    expect(
      svc.listEventsForItem(id).events.filter((e) => e.type === "answered"),
    ).toHaveLength(1);

    const clash = await app.request(`http://127.0.0.1/api/items/${id}/answer`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "Different", return_to: "agent" }),
    });
    expect(clash.status).toBe(422);
  });

  it("context_get via MCP includes answer decision note", async () => {
    const id = await seedNeedsYou();
    await app.request(`http://127.0.0.1/api/items/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Source": "ui" },
      body: JSON.stringify({ text: "Agent-visible reply", return_to: "agent" }),
    });
    const pack = (await invokeMcpTool(
      svc,
      "context_get",
      { id },
      "agent-code",
    )) as {
      context: { notes: Array<{ role: string; body_md: string }> };
      events: Array<{ type: string }>;
    };
    expect(
      pack.context.notes.some(
        (n) => n.role === "decision" && n.body_md === "Agent-visible reply",
      ),
    ).toBe(true);
    expect(pack.events.some((e) => e.type === "answered")).toBe(true);
  });
});

describe("write validation → 400 validation_error", () => {
  let dir: string;
  let svc: RelayService;
  let app: ReturnType<typeof createApp>;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-write-400-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    app = createApp(svc, "http://127.0.0.1:7421");
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function seedNeedsYou(): Promise<string> {
    const item = svc.createItem(
      {
        title: "Decide",
        assignee_type: "agent",
        assignee_id: "agent-code",
      },
      actor,
      "ui",
    );
    svc.askUser(item.id, "Ship Friday?", actor, "ui");
    return item.id;
  }

  async function expectValidation400(
    res: Response,
    field: string,
  ): Promise<{ error: string; message: string; field?: string }> {
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      message: string;
      field?: string;
    };
    expect(body.error).toBe("validation_error");
    expect(body.field).toBe(field);
    expect(body.message).toContain(field);
    return body;
  }

  it("answer rejects empty and oversized text with 400 validation_error", async () => {
    const id = await seedNeedsYou();
    const empty = await app.request(`http://127.0.0.1/api/items/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    await expectValidation400(empty, "text");

    const oversized = await app.request(
      `http://127.0.0.1/api/items/${id}/answer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(4001) }),
      },
    );
    await expectValidation400(oversized, "text");
  });

  it("answer/take/PATCH reject malformed if_updated_at with 400 validation_error", async () => {
    const id = await seedNeedsYou();
    const bad = "not-a-timestamp";
    const cases: Array<{ method: string; path: string; body: unknown }> = [
      {
        method: "POST",
        path: `/api/items/${id}/answer`,
        body: { text: "ok", if_updated_at: bad },
      },
      {
        method: "POST",
        path: `/api/items/${id}/take`,
        body: { if_updated_at: bad },
      },
      {
        method: "PATCH",
        path: `/api/items/${id}`,
        body: { title: "x", if_updated_at: bad },
      },
      {
        method: "POST",
        path: `/api/items/${id}/status`,
        body: { status: "in_progress", if_updated_at: bad },
      },
    ];
    for (const row of cases) {
      const res = await app.request(`http://127.0.0.1${row.path}`, {
        method: row.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.body),
      });
      await expectValidation400(res, "if_updated_at");
    }
  });

  it("malformed Idempotency-Key returns 400 validation_error (never 500)", async () => {
    const id = await seedNeedsYou();
    // Fetch Headers reject CR/LF; cover embedded spaces and oversize.
    const badKeys = ["has space", "a".repeat(257)];
    for (const key of badKeys) {
      const res = await app.request(`http://127.0.0.1/api/items/${id}/take`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: "{}",
      });
      await expectValidation400(res, "Idempotency-Key");
    }
  });

  it("answer note title is i18n prefix + item title, body holds the text", async () => {
    const id = await seedNeedsYou();
    const item = svc.getItem(id);
    const res = await app.request(`http://127.0.0.1/api/items/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Source": "ui" },
      body: JSON.stringify({
        text: "Ship version A (Relay).",
        return_to: "agent",
        locale: "en",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      note: { title: string; body_md: string };
    };
    expect(body.note.title).toBe(`Decision: ${item.title}`);
    expect(body.note.body_md).toBe("Ship version A (Relay).");
    expect(body.note.title).not.toContain("Ship version");
  });
});
