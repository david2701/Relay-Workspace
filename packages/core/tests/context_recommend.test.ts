import { describe, expect, it } from "vitest";
import { buildContextPack } from "../src/domain/context_pack.js";
import { recommendInbox } from "../src/domain/recommend.js";
import { DEFAULT_AGENTS } from "../src/schemas/agent.js";
import type { WorkItem } from "../src/schemas/work_item.js";

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: "itm_abcdefghij",
    title: "Ítem",
    goal: "Listo cuando haya PR",
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
    created_at: "2026-10-04T10:00:00.000Z",
    updated_at: "2026-10-04T10:00:00.000Z",
    started_at: "2026-10-04T10:00:00.000Z",
    completed_at: null,
    completed_by_type: null,
    completed_by_id: null,
    last_actor_type: "agent",
    last_actor_id: "agent-code",
    list_id: null,
    ...overrides,
  };
}

describe("context_get contents", () => {
  it("includes goal, reasons, reminder_intent and notes by role", () => {
    const pack = buildContextPack({
      item: item({
        status: "needs_you",
        needs_you_reason: "Elegir titular",
        reminder_at: "2026-10-05T16:00:00.000Z",
        reminder_intent: "Revisar borrador",
      }),
      notes: [
        {
          id: "nte_aaaaaaaaaa",
          title: "Brief",
          body_md: "Línea 1\nLínea 2\nLínea 3\nLínea 4",
          created_at: "2026-10-05T10:00:00.000Z",
          updated_at: "2026-10-05T10:00:00.000Z",
        },
        {
          id: "nte_bbbbbbbbbb",
          title: "Decisión previa",
          body_md: "Usar Relay",
          created_at: "2026-10-05T10:00:00.000Z",
          updated_at: "2026-10-05T10:00:00.000Z",
        },
      ],
      links: [
        { item_id: "itm_abcdefghij", note_id: "nte_aaaaaaaaaa", role: "context" },
        { item_id: "itm_abcdefghij", note_id: "nte_bbbbbbbbbb", role: "decision" },
      ],
      agents: DEFAULT_AGENTS,
    });
    expect(pack.goal).toContain("PR");
    expect(pack.needs_you_reason).toBe("Elegir titular");
    expect(pack.reminder_intent).toBe("Revisar borrador");
    expect(pack.notes[0]?.role).toBe("decision");
    expect(pack.notes[1]?.body_preview.split("\n")).toHaveLength(3);
    expect(pack.assignee_display_name).toBe("Code agent");
  });
});

describe("recommend heuristics", () => {
  const now = new Date("2026-10-05T15:00:00.000Z");

  it("surfaces needs_you waiting, blocked, due, reminder and stale wip", () => {
    const recs = recommendInbox({
      now,
      limit: 5,
      agents: DEFAULT_AGENTS,
      items: [
        item({
          id: "itm_needsyou01",
          status: "needs_you",
          needs_you_reason: "Decide",
          updated_at: "2026-10-05T10:00:00.000Z",
        }),
        item({
          id: "itm_blocked001",
          status: "blocked",
          blocked_reason: "falta acceso",
        }),
        item({
          id: "itm_due0000001",
          due_at: "2026-10-05T18:00:00.000Z",
          status: "assigned",
        }),
        item({
          id: "itm_remind0001",
          reminder_at: "2026-10-05T16:00:00.000Z",
          reminder_intent: "Llamar",
          status: "assigned",
        }),
        item({
          id: "itm_stale00001",
          status: "in_progress",
          updated_at: "2026-10-04T10:00:00.000Z",
        }),
      ],
    });
    const kinds = recs.map((r) => r.kind);
    expect(kinds).toContain("needs_you_waiting");
    expect(kinds).toContain("blocked");
    expect(kinds).toContain("due_soon");
    expect(kinds).toContain("reminder_soon");
    expect(kinds).toContain("stale_wip");
    expect(recs.find((r) => r.kind === "blocked")?.reason).toContain("falta acceso");
  });
});
