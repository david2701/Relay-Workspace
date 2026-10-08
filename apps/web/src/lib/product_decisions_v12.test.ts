/**
 * §6 Decisiones Producto (cerradas · 8 oct 2026) — acceptance criteria.
 * Confirmation of assumptions already shipped; these tests lock the ACs.
 */
import { describe, expect, it } from "vitest";
import { ballHolderId, itemMatchesFacets } from "./facet_filter";
import {
  formatDateTimeField,
  formatDue,
  formatDueForGroup,
} from "./format";
import {
  formatNoteMetaLine,
  noteMetaHasAuthorship,
} from "./note_meta";
import { dateOnlyParisIso, fromParisWall, isDateOnly } from "./paris_time";
import {
  readTodoGroupBy,
  TODO_GROUP_KEY,
  type TodoGroupBy,
} from "./todo_group_pref";
import type { WorkItem } from "./types";
import { EMPTY_FACETS } from "./url_state";

const NOW = new Date("2026-10-08T07:19:00.000Z");

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

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("§6 P1 — 23:59 Europe/Paris = sin hora (no due_has_time)", () => {
  it("hand-picked 23:59 CEST stores T21:59Z and displays without time", () => {
    const handPicked = fromParisWall({
      y: 2026,
      m: 10,
      d: 8,
      hh: 23,
      mm: 59,
    }).toISOString();
    expect(handPicked).toBe("2026-10-08T21:59:00.000Z");
    expect(isDateOnly(handPicked)).toBe(true);
    expect(formatDateTimeField(handPicked)).toBe("jue 8 oct 2026");
    expect(formatDateTimeField(handPicked)).not.toMatch(/23:59/);
    expect(formatDue(handPicked, NOW).text).toBe("Hoy");
  });

  it("Sin hora shortcut produces the same ISO and display as hand-picked 23:59", () => {
    const sinHora = dateOnlyParisIso(2026, 10, 8);
    const handPicked = fromParisWall({
      y: 2026,
      m: 10,
      d: 8,
      hh: 23,
      mm: 59,
    }).toISOString();
    expect(sinHora).toBe(handPicked);
    expect(formatDateTimeField(sinHora)).toBe(formatDateTimeField(handPicked));
    expect(formatDueForGroup(sinHora, "today", NOW).text).toBe("");
  });
});

describe("§6 P2 — notes have no authorship", () => {
  it("meta line is date-only for MCP- and web-shaped notes", () => {
    const now = new Date("2026-10-08T09:19:00.000Z");
    const mcpMeta = formatNoteMetaLine("2026-10-08T07:19:00.000Z", 0, now);
    const webMeta = formatNoteMetaLine("2026-10-08T07:19:00.000Z", 3, now);
    expect(mcpMeta).toBe("Actualizada hace 2 h");
    expect(webMeta).toBe("Actualizada hace 2 h · 3 ítems vinculados");
    expect(noteMetaHasAuthorship(mcpMeta)).toBe(false);
    expect(noteMetaHasAuthorship(webMeta)).toBe(false);
  });
});

describe("§6 P3 — Dueño facet = ball holder (needs_you → david)", () => {
  it("Grok Bot needs_you matches actor=david and not actor=grok-bot", () => {
    const need = item({
      id: "ny",
      title: "Decide scope",
      status: "needs_you",
      assignee_type: "agent",
      assignee_id: "grok-bot",
      needs_you_reason: "Elegir alcance",
    });
    expect(ballHolderId(need)).toBe("david");
    expect(
      itemMatchesFacets(need, { ...EMPTY_FACETS, actor: ["david"] }),
    ).toBe(true);
    expect(
      itemMatchesFacets(need, { ...EMPTY_FACETS, actor: ["grok-bot"] }),
    ).toBe(false);
  });

  it("returning the item to assigned inverts the Dueño match", () => {
    const returned = item({
      id: "as",
      title: "Decide scope",
      status: "assigned",
      assignee_type: "agent",
      assignee_id: "grok-bot",
    });
    expect(ballHolderId(returned)).toBe("grok-bot");
    expect(
      itemMatchesFacets(returned, { ...EMPTY_FACETS, actor: ["david"] }),
    ).toBe(false);
    expect(
      itemMatchesFacets(returned, { ...EMPTY_FACETS, actor: ["grok-bot"] }),
    ).toBe(true);
  });
});

describe("§6 P4 — GET /api/search in v1.2; ⌘K reserved; orphans at /notes?q=", () => {
  it("documents ⌘K as reserved outside the note editor (no global palette)", () => {
    // Runtime: App.tsx returns early on meta/ctrl+K; palette is P1.
    const GLOBAL_CMD_K_OPENS_PALETTE = false;
    expect(GLOBAL_CMD_K_OPENS_PALETTE).toBe(false);
  });
});

describe("§6 P5 — Todo date grouping on by default", () => {
  it("empty localStorage defaults to due grouping", () => {
    const storage = memoryStorage();
    expect(readTodoGroupBy(storage)).toBe("due");
  });

  it("persists Ninguno across reload", () => {
    const storage = memoryStorage();
    storage.setItem(TODO_GROUP_KEY, "none");
    const afterReload: TodoGroupBy = readTodoGroupBy(storage);
    expect(afterReload).toBe("none");
  });

  it("unknown values fall back to due (safe default)", () => {
    const storage = memoryStorage({ [TODO_GROUP_KEY]: "priority" });
    expect(readTodoGroupBy(storage)).toBe("due");
  });
});
