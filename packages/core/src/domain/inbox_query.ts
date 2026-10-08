import type { InboxView } from "../schemas/enums.js";
import type {
  InboxQueryResult,
  InboxSyncResult,
} from "../schemas/inbox.js";
import type { WorkItem } from "../schemas/work_item.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import { countDueGroups } from "./date_groups.js";
import { nowIso } from "./time.js";
import {
  addZoneDays,
  DEFAULT_TIMEZONE,
  endOfZoneDay,
  startOfZoneDay,
} from "./zone_time.js";

function isTerminal(item: WorkItem): boolean {
  return item.status === "done" || item.status === "cancelled";
}

function countNeedsYou(items: readonly WorkItem[]): number {
  return items.filter((i) => i.status === "needs_you").length;
}

function nearestSchedule(item: WorkItem): Date | null {
  const dates: Date[] = [];
  if (item.due_at) dates.push(new Date(item.due_at));
  if (item.reminder_at) dates.push(new Date(item.reminder_at));
  if (dates.length === 0) return null;
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

/**
 * Stable group codes only — UI maps key → locale / Intl.
 * `label` mirrors `key` (never localized prose).
 * `date` is set for weekday buckets so the client can format via Intl.
 */
function groupLabel(
  date: Date,
  now: Date,
  timeZone: string,
): { key: string; label: string; date?: string } {
  const today = startOfZoneDay(now, timeZone);
  const target = startOfZoneDay(date, timeZone);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return { key: "today", label: "today" };
  if (diffDays === 1) return { key: "tomorrow", label: "tomorrow" };
  if (diffDays === -1) return { key: "yesterday", label: "yesterday" };
  if (diffDays > 1 && diffDays < 7) {
    return {
      key: `dow-${diffDays}`,
      label: `dow-${diffDays}`,
      date: date.toISOString(),
    };
  }
  if (diffDays < -1 && diffDays > -7) {
    return { key: "this_week", label: "this_week" };
  }
  return { key: "this_week", label: "this_week" };
}

type AttentionBuckets = {
  needsYou: WorkItem[];
  blocked: WorkItem[];
  today: WorkItem[];
};

function buildAttention(
  items: readonly WorkItem[],
  now: Date,
  timeZone: string,
): AttentionBuckets {
  // Spec order (v1.1 §1.2): needs_you / blocked oldest-first; today by schedule.
  const needsYou = items
    .filter((i) => i.status === "needs_you")
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const blocked = items
    .filter((i) => i.status === "blocked")
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const endToday = endOfZoneDay(now, timeZone);
  const today = items
    .filter((i) => {
      if (isTerminal(i)) return false;
      if (i.status === "needs_you" || i.status === "blocked") return false;
      const due = i.due_at ? new Date(i.due_at) : null;
      const rem = i.reminder_at ? new Date(i.reminder_at) : null;
      const hitDue = due !== null && due.getTime() <= endToday.getTime();
      const hitRem = rem !== null && rem.getTime() <= endToday.getTime();
      return hitDue || hitRem;
    })
    .sort((a, b) => {
      const na = nearestSchedule(a)?.getTime() ?? 0;
      const nb = nearestSchedule(b)?.getTime() ?? 0;
      return na - nb;
    });
  return { needsYou, blocked, today };
}

type GroupBucket = {
  key: string;
  label: string;
  date?: string;
  items: WorkItem[];
};

function buildFullView(
  items: readonly WorkItem[],
  view: InboxView,
  now: Date,
  timeZone: string,
): {
  items: WorkItem[];
  sections?: InboxQueryResult["sections"];
  groups?: InboxQueryResult["groups"];
  section_counts?: InboxQueryResult["section_counts"];
  group_counts?: InboxQueryResult["group_counts"];
} {
  if (view === "attention") {
    const { needsYou, blocked, today } = buildAttention(items, now, timeZone);
    return {
      items: [...needsYou, ...blocked, ...today],
      sections: [
        { key: "needs_you", items: needsYou },
        { key: "blocked", items: blocked },
        { key: "today", items: today },
      ],
      section_counts: {
        needs_you: needsYou.length,
        blocked: blocked.length,
        today: today.length,
      },
    };
  }
  if (view === "agent_wip") {
    const order = { in_progress: 0, assigned: 1, blocked: 2 } as const;
    const filtered = items
      .filter(
        (i) =>
          i.assignee_type === "agent" &&
          (i.status === "assigned" ||
            i.status === "in_progress" ||
            i.status === "blocked"),
      )
      .sort((a, b) => {
        const oa = order[a.status as keyof typeof order] ?? 9;
        const ob = order[b.status as keyof typeof order] ?? 9;
        if (oa !== ob) return oa - ob;
        return b.updated_at.localeCompare(a.updated_at);
      });
    return { items: filtered };
  }
  if (view === "upcoming") {
    const horizon = addZoneDays(endOfZoneDay(now, timeZone), 7, timeZone);
    const filtered = items
      .filter((i) => {
        if (isTerminal(i)) return false;
        const near = nearestSchedule(i);
        if (!near) return false;
        return near.getTime() <= horizon.getTime();
      })
      .sort((a, b) => {
        const na = nearestSchedule(a)?.getTime() ?? 0;
        const nb = nearestSchedule(b)?.getTime() ?? 0;
        return na - nb;
      });
    const groupMap = new Map<string, GroupBucket>();
    for (const item of filtered) {
      const near = nearestSchedule(item);
      if (!near) continue;
      const g = groupLabel(near, now, timeZone);
      const existing = groupMap.get(g.key);
      if (existing) existing.items.push(item);
      else groupMap.set(g.key, { ...g, items: [item] });
    }
    const groups = [...groupMap.values()];
    return {
      items: filtered,
      groups,
      group_counts: groups.map((g) => ({
        key: g.key,
        label: g.label,
        ...(g.date ? { date: g.date } : {}),
        count: g.items.length,
      })),
    };
  }
  if (view === "done") {
    const weekAgo = addZoneDays(startOfZoneDay(now, timeZone), -7, timeZone);
    const filtered = items
      .filter((i) => {
        if (!isTerminal(i) || !i.completed_at) return false;
        return new Date(i.completed_at).getTime() >= weekAgo.getTime();
      })
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    const groupMap = new Map<string, GroupBucket>();
    for (const item of filtered) {
      if (!item.completed_at) continue;
      const g = groupLabel(new Date(item.completed_at), now, timeZone);
      const key =
        g.key === "today"
          ? "today"
          : g.key === "yesterday"
            ? "yesterday"
            : "this_week";
      const existing = groupMap.get(key);
      if (existing) existing.items.push(item);
      else groupMap.set(key, { key, label: key, items: [item] });
    }
    const order = ["today", "yesterday", "this_week"];
    const groups = order
      .map((k) => groupMap.get(k))
      .filter((g): g is GroupBucket => g !== undefined);
    return {
      items: filtered,
      groups,
      group_counts: groups.map((g) => ({
        key: g.key,
        label: g.label,
        count: g.items.length,
      })),
    };
  }
  const filtered = items
    .filter((i) => !isTerminal(i))
    .sort((a, b) => {
      if (a.status === "inbox" && b.status !== "inbox") return -1;
      if (b.status === "inbox" && a.status !== "inbox") return 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  return {
    items: filtered,
    // Full-view date-group totals for Todo «Agrupar: Fecha» (page-independent).
    group_counts: countDueGroups(filtered, now, timeZone),
  };
}

function resolveCursorId(cursor: string | undefined): string | null {
  if (!cursor) return null;
  if (cursor.startsWith("itm_")) return cursor;
  return decodeCursor(cursor)?.id ?? null;
}

function paginateItems(
  items: readonly WorkItem[],
  opts: { limit?: number; cursor?: string },
): { page: WorkItem[]; next_cursor: string | null; has_more: boolean } {
  let start = 0;
  const cursorId = resolveCursorId(opts.cursor);
  if (cursorId) {
    const idx = items.findIndex((i) => i.id === cursorId);
    start = idx >= 0 ? idx + 1 : 0;
  }
  if (opts.limit === undefined) {
    const page = items.slice(start);
    return { page, next_cursor: null, has_more: false };
  }
  const page = items.slice(start, start + opts.limit);
  const has_more = start + opts.limit < items.length;
  const last = page[page.length - 1];
  const next_cursor =
    has_more && last
      ? encodeCursor({ id: last.id, updated_at: last.updated_at })
      : null;
  return { page, next_cursor, has_more };
}

function sliceSections(
  sections: NonNullable<InboxQueryResult["sections"]>,
  pageIds: Set<string>,
): InboxQueryResult["sections"] {
  return sections.map((s) => ({
    key: s.key,
    items: s.items.filter((i) => pageIds.has(i.id)),
  }));
}

function sliceGroups(
  groups: NonNullable<InboxQueryResult["groups"]>,
  pageIds: Set<string>,
): InboxQueryResult["groups"] {
  return groups
    .map((g) => ({
      key: g.key,
      label: g.label,
      ...(g.date ? { date: g.date } : {}),
      items: g.items.filter((i) => pageIds.has(i.id)),
    }))
    .filter((g) => g.items.length > 0);
}

export type InboxQueryArgs = {
  items: readonly WorkItem[];
  view: InboxView;
  now?: Date;
  /** IANA timezone for day boundaries (default UTC). */
  timeZone?: string;
  limit?: number;
  /** Opaque cursor or raw item id of the last item on the previous page. */
  cursor?: string;
};

export function queryInbox(args: InboxQueryArgs): InboxQueryResult {
  const now = args.now ?? new Date();
  const timeZone = args.timeZone ?? DEFAULT_TIMEZONE;
  const counters = { needs_you: countNeedsYou(args.items) };
  const full = buildFullView(args.items, args.view, now, timeZone);
  const pageOpts: { limit?: number; cursor?: string } = {};
  if (args.limit !== undefined) pageOpts.limit = args.limit;
  if (args.cursor !== undefined) pageOpts.cursor = args.cursor;
  const { page, next_cursor, has_more } = paginateItems(full.items, pageOpts);
  // List pages omit goal (detail fetch still has it) to keep web first-paint
  // payloads under ~200 KB at the Atención window of 200 rows.
  const pageItems =
    args.limit !== undefined
      ? page.map((item) => (item.goal ? { ...item, goal: null } : item))
      : page;
  const pageIds = new Set(pageItems.map((i) => i.id));
  const result: InboxQueryResult = {
    view: args.view,
    items: pageItems,
    counters,
    total_count: full.items.length,
    next_cursor,
    has_more,
    // Wall-clock cursor (not max(updated_at)): seed/future dates must not
    // hide later mutations from incremental poll.
    sync_cursor: nowIso(now),
    server_time: nowIso(now),
  };
  if (full.section_counts) result.section_counts = full.section_counts;
  if (full.group_counts) result.group_counts = full.group_counts;
  // Paged responses: send flat `items` only (client rebuilds sections) so the
  // JSON is not doubled by sections[].items — keeps Atención ≤200 KB.
  if (full.sections && args.limit === undefined) {
    result.sections = sliceSections(full.sections, pageIds);
  }
  if (full.groups) result.groups = sliceGroups(full.groups, pageIds);
  return result;
}

export type InboxSyncArgs = {
  items: readonly WorkItem[];
  view: InboxView;
  since: string;
  now?: Date;
  timeZone?: string;
};

export function buildInboxSync(args: InboxSyncArgs): InboxSyncResult {
  const now = args.now ?? new Date();
  const timeZone = args.timeZone ?? DEFAULT_TIMEZONE;
  const counters = { needs_you: countNeedsYou(args.items) };
  const full = buildFullView(args.items, args.view, now, timeZone);
  const inView = new Set(full.items.map((i) => i.id));
  const changed = args.items.filter((i) => i.updated_at > args.since);
  const upserts: WorkItem[] = [];
  const removed_ids: string[] = [];
  for (const item of changed) {
    if (inView.has(item.id)) upserts.push(item);
    else removed_ids.push(item.id);
  }
  const result: InboxSyncResult = {
    view: args.view,
    mode: "delta",
    upserts,
    removed_ids,
    counters,
    total_count: full.items.length,
    sync_cursor: nowIso(now),
    server_time: nowIso(now),
  };
  if (full.section_counts) result.section_counts = full.section_counts;
  if (full.group_counts) result.group_counts = full.group_counts;
  return result;
}

/** Membership helper for search view filter. */
export function itemIdsInView(
  items: readonly WorkItem[],
  view: InboxView,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): Set<string> {
  return new Set(buildFullView(items, view, now, timeZone).items.map((i) => i.id));
}
