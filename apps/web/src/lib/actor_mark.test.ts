import { describe, expect, it } from "vitest";
import {
  assertMarkConsistent,
  markForActor,
  markForCompleter,
  markForOwner,
  markForWitness,
} from "./actor_mark";
import type { Agent, WorkItem } from "./types";

const agents: Agent[] = [
  { id: "grok-bot", display_name: "Grok Bot", monogram: "GB" },
  { id: "draft-smith", display_name: "Draft Smith", monogram: "DS" },
];

function baseItem(patch: Partial<WorkItem>): WorkItem {
  return {
    id: "itm_test",
    title: "Elegir titular del post de lanzamiento",
    goal: null,
    status: "needs_you",
    assignee_type: "agent",
    assignee_id: "grok-bot",
    due_at: null,
    reminder_at: null,
    reminder_intent: null,
    priority: "none",
    blocked_reason: null,
    needs_you_reason: "¿Titular A o B?",
    source: "mcp",
    created_at: "2026-10-05T10:00:00.000Z",
    updated_at: "2026-10-05T12:00:00.000Z",
    started_at: null,
    completed_at: null,
    completed_by_type: null,
    completed_by_id: null,
    last_actor_type: "agent",
    last_actor_id: "grok-bot",
    list_id: null,
    ...patch,
  };
}

describe("actor mark identity", () => {
  it("needs_you witness is David circle, never GB in a circle", () => {
    const mark = markForWitness(baseItem({}), agents);
    expect(mark).toEqual({ kind: "user", name: "David", monogram: "D" });
    expect(() => assertMarkConsistent(mark)).not.toThrow();
  });

  it("needs_you owner (Sugerido) is agent square GB, never circle", () => {
    const mark = markForOwner(baseItem({}), agents);
    expect(mark).toEqual({
      kind: "agent",
      name: "Grok Bot",
      monogram: "GB",
    });
    expect(() => assertMarkConsistent(mark)).not.toThrow();
  });

  it("blocked owner and witness stay agent square", () => {
    const item = baseItem({
      status: "blocked",
      blocked_reason: "staging caído",
      needs_you_reason: null,
    });
    expect(markForOwner(item, agents).kind).toBe("agent");
    expect(markForWitness(item, agents).monogram).toBe("GB");
  });

  it("David assignee is never a square", () => {
    const mark = markForActor("user", "david", agents);
    expect(mark.kind).toBe("user");
    expect(mark.monogram).toBe("D");
  });

  it("completer mark follows completed_by type", () => {
    const byAgent = markForCompleter(
      baseItem({
        status: "done",
        completed_at: "2026-10-05T13:00:00.000Z",
        completed_by_type: "agent",
        completed_by_id: "grok-bot",
      }),
      agents,
    );
    expect(byAgent).toEqual({
      kind: "agent",
      name: "Grok Bot",
      monogram: "GB",
    });
    const byDavid = markForCompleter(
      baseItem({
        status: "done",
        completed_at: "2026-10-05T13:00:00.000Z",
        completed_by_type: "user",
        completed_by_id: "david",
      }),
      agents,
    );
    expect(byDavid).toEqual({ kind: "user", name: "David", monogram: "D" });
  });

  it("assertMarkConsistent rejects GB inside a human circle", () => {
    expect(() =>
      assertMarkConsistent({ kind: "user", name: "Grok Bot", monogram: "GB" }),
    ).toThrow(/human shape/);
  });
});
