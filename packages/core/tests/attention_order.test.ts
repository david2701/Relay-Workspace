import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";

describe("Atención section order (v1.1 §1.2)", () => {
  let dir: string;
  let svc: RelayService;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-att-order-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("orders needs_you and blocked oldest-first by updated_at", () => {
    const older = svc.createItem({ title: "Older need" }, actor, "ui");
    svc.delegate(older.id, "agent-code", actor, "ui");
    svc.askUser(
      older.id,
      "old reason",
      { type: "agent", id: "agent-code" },
      "mcp",
    );

    // Ensure a later wall-clock stamp on the newer item.
    const newer = svc.createItem({ title: "Newer need" }, actor, "ui");
    svc.delegate(newer.id, "agent-code", actor, "ui");
    svc.askUser(
      newer.id,
      "new reason",
      { type: "agent", id: "agent-code" },
      "mcp",
    );

    const blockedOld = svc.createItem({ title: "Old block" }, actor, "ui");
    svc.delegate(blockedOld.id, "agent-research", actor, "ui");
    svc.setStatus(
      blockedOld.id,
      { status: "blocked", blocked_reason: "old block" },
      { type: "agent", id: "agent-research" },
      "mcp",
    );
    const blockedNew = svc.createItem({ title: "New block" }, actor, "ui");
    svc.delegate(blockedNew.id, "agent-research", actor, "ui");
    svc.setStatus(
      blockedNew.id,
      { status: "blocked", blocked_reason: "new block" },
      { type: "agent", id: "agent-research" },
      "mcp",
    );

    const snap = svc.inboxQuery("attention");
    if ("mode" in snap) throw new Error("expected snapshot");
    const needs = snap.sections?.find((s) => s.key === "needs_you")?.items ?? [];
    const blocked = snap.sections?.find((s) => s.key === "blocked")?.items ?? [];
    expect(needs.map((i) => i.id)).toEqual([older.id, newer.id]);
    expect(blocked.map((i) => i.id)).toEqual([blockedOld.id, blockedNew.id]);
    expect(needs[0]!.updated_at <= needs[1]!.updated_at).toBe(true);
    expect(blocked[0]!.updated_at <= blocked[1]!.updated_at).toBe(true);
  });
});
