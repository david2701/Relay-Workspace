import { describe, expect, it } from "vitest";
import { classifyDue, groupByDue } from "./date_groups";
import type { WorkItem } from "./types";

const NOW = new Date("2026-10-08T07:19:00.000Z"); // jue 8 oct 09:19 CEST

function item(
  patch: Partial<WorkItem> & Pick<WorkItem, "id" | "title" | "status">,
): WorkItem {
  return {
    goal: null,
    assignee_type: "unassigned",
    assignee_id: null,
    due_at: null,
    reminder_at: null,
    reminder_intent: null,
    priority: "none",
    blocked_reason: null,
    needs_you_reason: null,
    source: "ui",
    created_at: "2026-10-05T10:00:00.000Z",
    updated_at: "2026-10-05T12:00:00.000Z",
    started_at: null,
    completed_at: null,
    completed_by_type: null,
    completed_by_id: null,
    last_actor_type: "user",
    last_actor_id: "david",
    list_id: null,
    ...patch,
  };
}

describe("groupByDue (V12-D14)", () => {
  it("orders groups and excludes tomorrow from Esta semana", () => {
    const overdue = item({
      id: "o",
      title: "Over",
      status: "assigned",
      due_at: "2026-10-07T10:00:00.000Z",
    });
    const today = item({
      id: "t",
      title: "Today",
      status: "inbox",
      // 23:59 Paris = date-only today
      due_at: "2026-10-08T21:59:00.000Z",
    });
    const tomorrow = item({
      id: "tm",
      title: "Tom",
      status: "inbox",
      due_at: "2026-10-09T07:00:00.000Z", // vie 9 09:00
    });
    const sat = item({
      id: "s",
      title: "Sat",
      status: "inbox",
      due_at: "2026-10-10T08:00:00.000Z", // sáb 10
    });
    const sun = item({
      id: "su",
      title: "Sun",
      status: "inbox",
      due_at: "2026-10-11T08:00:00.000Z",
    });
    const later = item({
      id: "l",
      title: "Later",
      status: "inbox",
      due_at: "2026-10-20T08:00:00.000Z",
    });
    const none = item({ id: "n", title: "None", status: "inbox", due_at: null });

    const groups = groupByDue(
      [none, later, sun, sat, tomorrow, today, overdue],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "week",
      "later",
      "none",
    ]);
    expect(groups.find((g) => g.key === "tomorrow")?.items.map((i) => i.id)).toEqual([
      "tm",
    ]);
    expect(groups.find((g) => g.key === "week")?.items.map((i) => i.id)).toEqual([
      "s",
      "su",
    ]);
    // vie 9 is tomorrow, not week
    expect(
      groups.find((g) => g.key === "week")?.items.some((i) => i.id === "tm"),
    ).toBe(false);
  });

  it("keeps date-only today out of overdue before 23:59", () => {
    expect(
      classifyDue("2026-10-08T21:59:00.000Z", "inbox", NOW),
    ).toBe("today");
  });
});
