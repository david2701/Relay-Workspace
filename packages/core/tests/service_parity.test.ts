import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RelayService } from "../src/services/relay_service.js";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";

describe("AC1 parity + service flows", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-core-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("create via ui and mcp share canonical field shapes", () => {
    const ui = svc.createItem(
      { title: "Desde la web" },
      { type: "user", id: USER_ACTOR_ID },
      "ui",
    );
    const mcp = svc.createItem(
      { title: "Desde el chat" },
      { type: "agent", id: "grok-bot" },
      "mcp",
    );
    const keys = Object.keys(ui).sort();
    expect(Object.keys(mcp).sort()).toEqual(keys);
    expect(ui.status).toBe("inbox");
    expect(ui.source).toBe("ui");
    expect(mcp.source).toBe("mcp");
    expect(mcp.last_actor_type).toBe("agent");
    expect(mcp.last_actor_id).toBe("grok-bot");
    expect(ui.last_actor_type).toBe("user");
  });

  it("context_get and note link/unlink", () => {
    const item = svc.createItem(
      { title: "Con contexto", goal: "Demo grabada" },
      { type: "user", id: USER_ACTOR_ID },
      "ui",
    );
    const note = svc.createNote({
      title: "Brief",
      body_md: "Público objetivo",
    });
    svc.linkNote(item.id, note.id, "context");
    const pack = svc.getContext(item.id);
    expect(pack.goal).toBe("Demo grabada");
    expect(pack.notes).toHaveLength(1);
    svc.unlinkNote(item.id, note.id);
    expect(svc.getContext(item.id).notes).toHaveLength(0);
    expect(svc.getNote(note.id).title).toBe("Brief");
  });

  it("resolveActor rejects user on mcp and unknown agents", () => {
    expect(() => svc.resolveActor({ id: USER_ACTOR_ID }, "mcp")).toThrow();
    expect(() => svc.resolveActor({ id: "nope" }, "mcp")).toThrow();
    expect(svc.resolveActor({ id: "grok-bot" }, "mcp")).toEqual({
      type: "agent",
      id: "grok-bot",
    });
    expect(svc.resolveActor(undefined, "ui")).toEqual({
      type: "user",
      id: USER_ACTOR_ID,
    });
  });

  it("inbox attention includes needs_you and blocked", () => {
    const a = svc.createItem(
      { title: "Necesita" },
      { type: "agent", id: "grok-bot" },
      "mcp",
    );
    svc.delegate(a.id, "grok-bot", { type: "user", id: USER_ACTOR_ID }, "ui");
    svc.askUser(a.id, "¿A o B del titular?", { type: "agent", id: "grok-bot" }, "mcp");
    const b = svc.createItem(
      { title: "Atascado" },
      { type: "agent", id: "dev-senior" },
      "mcp",
    );
    svc.delegate(b.id, "dev-senior", { type: "user", id: USER_ACTOR_ID }, "ui");
    svc.setStatus(
      b.id,
      { status: "blocked", blocked_reason: "falta acceso a /archive" },
      { type: "agent", id: "dev-senior" },
      "mcp",
    );
    const inbox = svc.inboxQuery("attention");
    expect(inbox.counters.needs_you).toBe(1);
    expect(inbox.sections?.find((s) => s.key === "needs_you")?.items).toHaveLength(1);
    expect(inbox.sections?.find((s) => s.key === "blocked")?.items).toHaveLength(1);
  });

  it("agent_wip excludes needs_you even when assignee stays the agent", () => {
    const needs = svc.createItem(
      { title: "Titular needs_you" },
      { type: "agent", id: "grok-bot" },
      "mcp",
    );
    svc.delegate(needs.id, "grok-bot", { type: "user", id: USER_ACTOR_ID }, "ui");
    svc.askUser(
      needs.id,
      "¿Publico A o B?",
      { type: "agent", id: "grok-bot" },
      "mcp",
    );
    const wip = svc.createItem(
      { title: "Demo in_progress" },
      { type: "agent", id: "grok-bot" },
      "mcp",
    );
    svc.delegate(wip.id, "grok-bot", { type: "user", id: USER_ACTOR_ID }, "ui");
    svc.setStatus(
      wip.id,
      { status: "in_progress" },
      { type: "agent", id: "grok-bot" },
      "mcp",
    );
    const blocked = svc.createItem(
      { title: "Build blocked" },
      { type: "agent", id: "dev-senior" },
      "mcp",
    );
    svc.delegate(blocked.id, "dev-senior", { type: "user", id: USER_ACTOR_ID }, "ui");
    svc.setStatus(
      blocked.id,
      { status: "blocked", blocked_reason: "staging caído" },
      { type: "agent", id: "dev-senior" },
      "mcp",
    );
    const inbox = svc.inboxQuery("agent_wip");
    expect(inbox.items.map((i) => i.id)).not.toContain(needs.id);
    expect(inbox.items.every((i) => i.status !== "needs_you")).toBe(true);
    expect(inbox.items.map((i) => i.status)).toEqual(["in_progress", "blocked"]);
    expect(inbox.counters.needs_you).toBe(1);
    const attention = svc.inboxQuery("attention");
    expect(attention.counters.needs_you).toBe(1);
    expect(
      attention.sections?.find((s) => s.key === "needs_you")?.items.map((i) => i.id),
    ).toContain(needs.id);
  });
});
