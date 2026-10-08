import { describe, expect, it } from "vitest";
import { ballHolderId, itemMatchesFacets } from "./facet_filter";
import type { WorkItem } from "./types";
import { EMPTY_FACETS } from "./url_state";

function item(patch: Partial<WorkItem> & Pick<WorkItem, "id" | "title" | "status">): WorkItem {
  return {
    goal: null,
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

describe("ballHolderId P3", () => {
  it("needs_you maps to user even when assignee is an agent", () => {
    const i = item({
      id: "n1",
      title: "Decide",
      status: "needs_you",
      assignee_type: "agent",
      assignee_id: "grok-bot",
    });
    expect(ballHolderId(i)).toBe("user");
  });

  it("assigned agent keeps agent as holder", () => {
    const i = item({
      id: "a1",
      title: "Work",
      status: "assigned",
      assignee_type: "agent",
      assignee_id: "dev-senior",
    });
    expect(ballHolderId(i)).toBe("dev-senior");
  });
});

describe("itemMatchesFacets", () => {
  it("AND across status and actor (V12-F10)", () => {
    const blockedDs = item({
      id: "1",
      title: "A",
      status: "blocked",
      assignee_id: "dev-senior",
    });
    const blockedQa = item({
      id: "2",
      title: "B",
      status: "blocked",
      assignee_id: "qa",
    });
    const facets = {
      ...EMPTY_FACETS,
      status: ["blocked" as const],
      actor: ["dev-senior"],
    };
    expect(itemMatchesFacets(blockedDs, facets)).toBe(true);
    expect(itemMatchesFacets(blockedQa, facets)).toBe(false);
  });

  it("needs_you matches actor=user (P3)", () => {
    const need = item({
      id: "n",
      title: "N",
      status: "needs_you",
      assignee_id: "grok-bot",
    });
    expect(
      itemMatchesFacets(need, { ...EMPTY_FACETS, actor: ["user"] }),
    ).toBe(true);
    expect(
      itemMatchesFacets(need, { ...EMPTY_FACETS, actor: ["grok-bot"] }),
    ).toBe(false);
  });
});
