import { describe, expect, it } from "vitest";
import { appendInboxPage, INBOX_PAGE_SIZE } from "./inbox_page";
import type { InboxResult, WorkItem } from "./types";

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

describe("appendInboxPage", () => {
  it("uses page size 50", () => {
    expect(INBOX_PAGE_SIZE).toBe(50);
  });

  it("appends without duplicating ids and keeps cursors", () => {
    const prev: InboxResult = {
      view: "all",
      items: [item({ id: "a", title: "A", status: "inbox" })],
      counters: { needs_you: 0 },
      total_count: 3,
      next_cursor: "c1",
      has_more: true,
      sync_cursor: "sync-1",
    };
    const page: InboxResult = {
      view: "all",
      items: [
        item({ id: "a", title: "A", status: "inbox" }),
        item({ id: "b", title: "B", status: "inbox" }),
      ],
      counters: { needs_you: 0 },
      total_count: 3,
      next_cursor: null,
      has_more: false,
      sync_cursor: "sync-2",
    };
    const next = appendInboxPage(prev, page);
    expect(next.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(next.has_more).toBe(false);
    expect(next.total_count).toBe(3);
  });
});
