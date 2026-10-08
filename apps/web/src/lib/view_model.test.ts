import { describe, expect, it } from "vitest";
import type { InboxResult, WorkItem } from "./types";
import {
  assertNoDuplicateIds,
  buildViewSections,
  type LingerRow,
} from "./view_model";

function item(patch: Partial<WorkItem> & Pick<WorkItem, "id" | "title" | "status">): WorkItem {
  return {
    goal: null,
    assignee_type: "agent",
    assignee_id: "agent-code",
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
    last_actor_id: "agent-code",
    list_id: null,
    ...patch,
  };
}

describe("buildViewSections", () => {
  it("returns empty when inbox view mismatches active view", () => {
    const inbox: InboxResult = {
      view: "attention",
      items: [item({ id: "a", title: "X", status: "needs_you" })],
      sections: [
        { key: "needs_you", items: [item({ id: "a", title: "X", status: "needs_you" })] },
        { key: "blocked", items: [] },
        { key: "today", items: [] },
      ],
      counters: { needs_you: 1 },
    };
    expect(
      buildViewSections({
        inbox,
        inboxView: "agent_wip",
        lingerRows: [],
        pendingRows: [],
        filter: "",
      }),
    ).toEqual([]);
  });

  it("excludes needs_you from agent_wip including linger, and never duplicates", () => {
    const needs = item({
      id: "n1",
      title: "Elegir titular",
      status: "needs_you",
      needs_you_reason: "¿A o B?",
    });
    const wip = item({ id: "w1", title: "Demo", status: "in_progress" });
    const inbox: InboxResult = {
      view: "agent_wip",
      items: [wip],
      counters: { needs_you: 1 },
    };
    const linger: LingerRow[] = [
      {
        item: needs,
        fromView: "agent_wip",
        until: Date.now() + 5000,
      },
    ];
    const sections = buildViewSections({
      inbox,
      inboxView: "agent_wip",
      lingerRows: linger,
      pendingRows: [wip],
      filter: "",
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.items.map((i) => i.id)).toEqual(["w1"]);
    expect(sections[0]?.items.every((i) => i.status !== "needs_you")).toBe(true);
    expect(() => assertNoDuplicateIds(sections, "agent_wip")).not.toThrow();
  });

  it("Hechos only keeps terminal linger and dedupes against group items", () => {
    const done = item({
      id: "d1",
      title: "Cerrar borrador",
      status: "done",
      completed_at: "2026-10-05T12:00:00.000Z",
      completed_by_type: "agent",
      completed_by_id: "agent-code",
    });
    const blocked = item({
      id: "b1",
      title: "Staging",
      status: "blocked",
      blocked_reason: "caído",
    });
    const inbox: InboxResult = {
      view: "done",
      items: [done],
      groups: [{ key: "today", label: "Hoy", items: [done] }],
      counters: { needs_you: 0 },
    };
    const sections = buildViewSections({
      inbox,
      inboxView: "done",
      lingerRows: [
        { item: done, fromView: "done", until: Date.now() + 5000 },
        { item: blocked, fromView: "done", until: Date.now() + 5000 },
      ],
      pendingRows: [],
      filter: "",
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.items).toHaveLength(1);
    expect(sections[0]?.items[0]?.id).toBe("d1");
    expect(sections[0]?.items.every((i) => i.status === "done")).toBe(true);
  });

  it("attention section counts equal row lengths with linger", () => {
    const a = item({
      id: "a1",
      title: "Ask",
      status: "needs_you",
      needs_you_reason: "?",
    });
    const b = item({
      id: "b1",
      title: "Block",
      status: "blocked",
      blocked_reason: "x",
    });
    const inbox: InboxResult = {
      view: "attention",
      items: [a],
      sections: [
        { key: "needs_you", items: [a] },
        { key: "blocked", items: [] },
        { key: "today", items: [] },
      ],
      counters: { needs_you: 1 },
    };
    const sections = buildViewSections({
      inbox,
      inboxView: "attention",
      lingerRows: [{ item: b, fromView: "attention", until: Date.now() + 5000 }],
      pendingRows: [],
      filter: "",
    });
    const blocked = sections.find((s) => s.key === "blocked");
    expect(blocked?.items).toHaveLength(1);
    expect(() => assertNoDuplicateIds(sections, "attention")).not.toThrow();
  });
});
