import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/domain/errors.js";
import {
  applyStatusChange,
  askUser,
  completeItem,
  reopenItem,
} from "../src/domain/transitions.js";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import type { WorkItem } from "../src/schemas/work_item.js";

function baseItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "itm_abcdefghij",
    title: "Demo",
    goal: null,
    status: "in_progress",
    assignee_type: "agent",
    assignee_id: "grok-bot",
    due_at: null,
    reminder_at: null,
    reminder_intent: null,
    priority: "none",
    blocked_reason: null,
    needs_you_reason: null,
    source: "mcp",
    created_at: "2026-10-05T10:00:00.000Z",
    updated_at: "2026-10-05T10:00:00.000Z",
    started_at: "2026-10-05T10:00:00.000Z",
    completed_at: null,
    completed_by_type: null,
    completed_by_id: null,
    last_actor_type: "agent",
    last_actor_id: "grok-bot",
    list_id: null,
    ...overrides,
  };
}

const agent = { type: "agent" as const, id: "grok-bot" };
const user = { type: "user" as const, id: USER_ACTOR_ID };

describe("status transitions", () => {
  it("requires blocked_reason", () => {
    expect(() =>
      applyStatusChange({
        item: baseItem(),
        input: { status: "blocked" },
        actor: agent,
        source: "mcp",
      }),
    ).toThrow(ValidationError);
  });

  it("requires needs_you_reason", () => {
    expect(() =>
      applyStatusChange({
        item: baseItem(),
        input: { status: "needs_you" },
        actor: agent,
        source: "mcp",
      }),
    ).toThrow(ValidationError);
  });

  it("ask_user sets needs_you without changing assignee", () => {
    const next = askUser({
      item: baseItem(),
      reason: "¿Publico A o B?",
      actor: agent,
      source: "mcp",
    });
    expect(next.status).toBe("needs_you");
    expect(next.needs_you_reason).toBe("¿Publico A o B?");
    expect(next.assignee_type).toBe("agent");
    expect(next.assignee_id).toBe("grok-bot");
    expect(next.last_actor_id).toBe("grok-bot");
  });

  it("complete stamps completed_by actor", () => {
    const next = completeItem({
      item: baseItem(),
      actor: agent,
      source: "mcp",
    });
    expect(next.status).toBe("done");
    expect(next.completed_by_type).toBe("agent");
    expect(next.completed_by_id).toBe("grok-bot");
    expect(next.completed_at).toBeTruthy();
  });

  it("reopen clears completed_* and goes to assigned when assignee exists", () => {
    const done = completeItem({
      item: baseItem(),
      actor: agent,
      source: "mcp",
    });
    const next = reopenItem({ item: done, actor: user });
    expect(next.status).toBe("assigned");
    expect(next.completed_at).toBeNull();
    expect(next.completed_by_type).toBeNull();
    expect(next.completed_by_id).toBeNull();
    expect(next.last_actor_id).toBe(USER_ACTOR_ID);
    expect(next.assignee_id).toBe("grok-bot");
  });

  it("reopen goes to inbox when unassigned", () => {
    const done = completeItem({
      item: baseItem({
        status: "inbox",
        assignee_type: "unassigned",
        assignee_id: null,
        started_at: null,
      }),
      actor: user,
      source: "ui",
    });
    const next = reopenItem({ item: done, actor: user });
    expect(next.status).toBe("inbox");
  });
});
