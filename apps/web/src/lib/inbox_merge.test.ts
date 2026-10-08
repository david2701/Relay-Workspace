import { describe, expect, it } from "vitest";
import {
  applyInboxDelta,
  isInboxDelta,
  rebuildAttentionSections,
} from "./inbox_merge";
import type { InboxResult, InboxSyncDelta, WorkItem } from "./types";

function item(
  patch: Partial<WorkItem> & Pick<WorkItem, "id" | "title" | "status">,
): WorkItem {
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

describe("rebuildAttentionSections", () => {
  it("partitions by status and sorts needs_you/blocked by updated_at ASC", () => {
    const a = item({
      id: "a",
      title: "A",
      status: "needs_you",
      updated_at: "2026-10-05T13:00:00.000Z",
    });
    const b = item({
      id: "b",
      title: "B",
      status: "needs_you",
      updated_at: "2026-10-05T11:00:00.000Z",
    });
    const c = item({
      id: "c",
      title: "C",
      status: "blocked",
      updated_at: "2026-10-05T14:00:00.000Z",
    });
    const d = item({ id: "d", title: "D", status: "inbox" });
    const sections = rebuildAttentionSections([a, b, c, d]);
    expect(sections.map((s) => s.key)).toEqual([
      "needs_you",
      "blocked",
      "today",
    ]);
    expect(sections[0]!.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(sections[1]!.items.map((i) => i.id)).toEqual(["c"]);
    expect(sections[2]!.items.map((i) => i.id)).toEqual(["d"]);
  });
});

describe("applyInboxDelta", () => {
  const base: InboxResult = {
    view: "attention",
    items: [
      item({ id: "n1", title: "Old needs", status: "needs_you" }),
      item({ id: "t1", title: "Today", status: "inbox" }),
      item({ id: "b1", title: "Blocked", status: "blocked" }),
    ],
    sections: [
      {
        key: "needs_you",
        items: [item({ id: "n1", title: "Old needs", status: "needs_you" })],
      },
      {
        key: "blocked",
        items: [item({ id: "b1", title: "Blocked", status: "blocked" })],
      },
      {
        key: "today",
        items: [item({ id: "t1", title: "Today", status: "inbox" })],
      },
    ],
    counters: { needs_you: 1 },
    sync_cursor: "cursor-1",
  };

  it("upserts, removes, and rebuilds attention sections", () => {
    const delta: InboxSyncDelta = {
      mode: "delta",
      upserts: [
        item({
          id: "n1",
          title: "Updated needs",
          status: "needs_you",
          needs_you_reason: "pick",
          updated_at: "2026-10-05T15:00:00.000Z",
        }),
        item({
          id: "n2",
          title: "New needs",
          status: "needs_you",
          updated_at: "2026-10-05T10:00:00.000Z",
        }),
      ],
      removed_ids: ["t1"],
      counters: { needs_you: 2 },
      sync_cursor: "cursor-2",
      server_time: "2026-10-05T15:00:01.000Z",
      total_count: 3,
    };
    const next = applyInboxDelta(base, delta);
    expect(next.items.map((i) => i.id).sort()).toEqual(["b1", "n1", "n2"]);
    expect(next.items.find((i) => i.id === "n1")?.title).toBe("Updated needs");
    expect(next.counters.needs_you).toBe(2);
    expect(next.sync_cursor).toBe("cursor-2");
    expect(next.server_time).toBe("2026-10-05T15:00:01.000Z");
    expect(next.total_count).toBe(3);
    expect(next.sections![0]!.items.map((i) => i.id)).toEqual(["n2", "n1"]);
    expect(next.sections![1]!.items.map((i) => i.id)).toEqual(["b1"]);
    expect(next.sections![2]!.items).toEqual([]);
  });

  it("moves an item between attention sections on status change", () => {
    const delta: InboxSyncDelta = {
      mode: "delta",
      upserts: [
        item({
          id: "n1",
          title: "Now blocked",
          status: "blocked",
          blocked_reason: "API",
        }),
      ],
      removed_ids: [],
      counters: { needs_you: 0 },
      sync_cursor: "cursor-3",
    };
    const next = applyInboxDelta(base, delta);
    expect(next.sections![0]!.items.map((i) => i.id)).toEqual([]);
    expect(next.sections![1]!.items.map((i) => i.id).sort()).toEqual([
      "b1",
      "n1",
    ]);
  });

  it("updates groups for non-attention views", () => {
    const prev: InboxResult = {
      view: "done",
      items: [
        item({ id: "d1", title: "Done 1", status: "done" }),
        item({ id: "d2", title: "Done 2", status: "done" }),
      ],
      groups: [
        {
          key: "today",
          label: "Hoy",
          items: [item({ id: "d1", title: "Done 1", status: "done" })],
        },
        {
          key: "earlier",
          label: "Antes",
          items: [item({ id: "d2", title: "Done 2", status: "done" })],
        },
      ],
      counters: { needs_you: 0 },
      sync_cursor: "c1",
    };
    const delta: InboxSyncDelta = {
      mode: "delta",
      upserts: [
        item({ id: "d1", title: "Done 1 renamed", status: "done" }),
        item({ id: "d3", title: "Done 3", status: "done" }),
      ],
      removed_ids: ["d2"],
      counters: { needs_you: 0 },
      sync_cursor: "c2",
    };
    const next = applyInboxDelta(prev, delta);
    expect(next.items.map((i) => i.id).sort()).toEqual(["d1", "d3"]);
    expect(next.groups![0]!.items.map((i) => i.id)).toEqual(["d3", "d1"]);
    expect(next.groups![0]!.items[1]!.title).toBe("Done 1 renamed");
    expect(next.groups![1]!.items).toEqual([]);
  });
});

describe("isInboxDelta", () => {
  it("accepts a well-formed delta", () => {
    expect(
      isInboxDelta({
        mode: "delta",
        upserts: [],
        removed_ids: [],
        counters: { needs_you: 0 },
        sync_cursor: "x",
      }),
    ).toBe(true);
  });

  it("rejects snapshots and partial payloads", () => {
    expect(
      isInboxDelta({
        view: "attention",
        items: [],
        counters: { needs_you: 0 },
        sync_cursor: "x",
      }),
    ).toBe(false);
    expect(
      isInboxDelta({
        mode: "delta",
        upserts: [],
        removed_ids: [],
        counters: { needs_you: 0 },
        sync_cursor: undefined as unknown as string,
      }),
    ).toBe(false);
  });
});
