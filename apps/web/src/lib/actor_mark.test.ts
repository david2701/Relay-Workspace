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
  { id: "agent-code", display_name: "Code agent", monogram: "CO" },
  { id: "draft-smith", display_name: "Draft Smith", monogram: "DS" },
];

function baseItem(patch: Partial<WorkItem>): WorkItem {
  return {
    id: "itm_test",
    title: "Choose the launch post headline",
    goal: null,
    status: "needs_you",
    assignee_type: "agent",
    assignee_id: "agent-code",
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
    last_actor_id: "agent-code",
    list_id: null,
    ...patch,
  };
}

describe("actor mark identity", () => {
  it("needs_you witness is Alex circle, never CO in a circle", () => {
    const mark = markForWitness(baseItem({}), agents);
    expect(mark).toEqual({ kind: "user", name: "Alex", monogram: "A" });
    expect(() => assertMarkConsistent(mark)).not.toThrow();
  });

  it("needs_you owner (Sugerido) is agent square CO, never circle", () => {
    const mark = markForOwner(baseItem({}), agents);
    expect(mark).toEqual({
      kind: "agent",
      name: "Code agent",
      monogram: "CO",
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
    expect(markForWitness(item, agents).monogram).toBe("CO");
  });

  it("Alex assignee is never a square", () => {
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
        completed_by_id: "agent-code",
      }),
      agents,
    );
    expect(byAgent).toEqual({
      kind: "agent",
      name: "Code agent",
      monogram: "CO",
    });
    const byAlex = markForCompleter(
      baseItem({
        status: "done",
        completed_at: "2026-10-05T13:00:00.000Z",
        completed_by_type: "user",
        completed_by_id: "david",
      }),
      agents,
    );
    expect(byAlex).toEqual({ kind: "user", name: "Alex", monogram: "A" });
  });

  it("assertMarkConsistent rejects CO inside a human circle", () => {
    expect(() =>
      assertMarkConsistent({ kind: "user", name: "Code agent", monogram: "CO" }),
    ).toThrow(/human shape/);
  });
});
