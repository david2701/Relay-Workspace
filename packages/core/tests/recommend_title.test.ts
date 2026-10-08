import { describe, expect, it } from "vitest";
import { recommendInbox } from "../src/domain/recommend.js";
import type { Agent } from "../src/schemas/agent.js";
import type { WorkItem } from "../src/schemas/work_item.js";

const agents: Agent[] = [
  { id: "agent-code", display_name: "Code agent", monogram: "GB" },
];

function item(partial: Partial<WorkItem> & { id: string; title: string }): WorkItem {
  return {
    goal: null,
    status: "in_progress",
    assignee_type: "agent",
    assignee_id: "agent-code",
    due_at: null,
    reminder_at: null,
    reminder_intent: null,
    priority: "none",
    blocked_reason: null,
    needs_you_reason: null,
    source: "mcp",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    started_at: "2026-09-01T00:00:00.000Z",
    completed_at: null,
    completed_by_type: null,
    completed_by_id: null,
    last_actor_type: "agent",
    last_actor_id: "agent-code",
    list_id: null,
    ...partial,
  };
}

describe("inbox_recommend titles", () => {
  it("every recommendation includes the item title, never only the id", () => {
    const now = new Date("2026-10-08T12:00:00.000Z");
    const items = [
      item({
        id: "itm_lg0004617",
        title: "Redactar la migración de datos",
        status: "in_progress",
        updated_at: "2026-09-10T00:00:00.000Z",
      }),
      item({
        id: "itm_overdue1",
        title: "Cerrar la matriz de riesgos",
        due_at: "2026-10-07T10:00:00.000Z",
        status: "inbox",
        assignee_type: "unassigned",
        assignee_id: null,
      }),
    ];
    const recs = recommendInbox({ items, agents, now, limit: 3 });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.title.startsWith("itm_")).toBe(false);
      expect(r.title).not.toBe(r.item_id);
    }
  });
});
