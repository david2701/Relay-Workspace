import type { InboxView } from "../schemas/enums.js";
import type {
  InboxQueryResult,
  InboxSyncResult,
} from "../schemas/inbox.js";
import type { WorkItem } from "../schemas/work_item.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import {
  addParisDays,
  endOfParisDay,
  parisWeekday,
  startOfParisDay,
} from "./paris_time.js";
import { nowIso } from "./time.js";

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

const WEEKDAY_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

function groupLabel(date: Date, now: Date): { key: string; label: string } {
  const today = startOfParisDay(now);
  const target = startOfParisDay(date);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return { key: "today", label: "Hoy" };
  if (diffDays === 1) return { key: "tomorrow", label: "Mañana" };
  if (diffDays === -1) return { key: "yesterday", label: "Ayer" };
  if (diffDays > 1 && diffDays < 7) {
    return {
      key: `dow-${diffDays}`,
      label: WEEKDAY_ES[parisWeekday(date)] ?? "día",
    };
  }
  if (diffDays < -1 && diffDays > -7) {
    return { key: "this_week", label: "Esta semana" };
  }
  return { key: "this_week", label: "Esta semana" };
}

type AttentionBuckets = {
  needsYou: WorkItem[];
  blocked: WorkItem[];
  today: WorkItem[];
};

function buildAttention(items: readonly WorkItem[], now: Date): AttentionBuckets {
  // Newest first: keeps MCP→UI mutations inside the virtualized window at 10k.
  const needsYou = items
    .filter((i) => i.status === "needs_you")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const blocked = items
    .filter((i) => i.status === "blocked")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const endToday = endOfParisDay(now);
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

type GroupBucket = { key: string; label: string; items: WorkItem[] };

function buildFullView(
  items: readonly WorkItem[],
  view: InboxView,
  now: Date,
): {
  items: WorkItem[];
  sections?: InboxQueryResult["sections"];
  groups?: InboxQueryResult["groups"];
  section_counts?: InboxQueryResult["section_counts"];
  group_counts?: InboxQueryResult["group_counts"];
} {
  if (view === "attention") {
    const { needsYou, blocked, today } = buildAttention(items, now);
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
    const horizon = addParisDays(endOfParisDay(now), 7);
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
      const g = groupLabel(near, now);
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
        count: g.items.length,
      })),
    };
  }
  if (view === "done") {
    const weekAgo = addParisDays(startOfParisDay(now), -7);
    const filtered = items
      .filter((i) => {
        if (!isTerminal(i) || !i.completed_at) return false;
        return new Date(i.completed_at).getTime() >= weekAgo.getTime();
      })
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    const groupMap = new Map<string, GroupBucket>();
    for (const item of filtered) {
      if (!item.completed_at) continue;
      const g = groupLabel(new Date(item.completed_at), now);
      const key =
        g.key === "today"
          ? "today"
          : g.key === "yesterday"
            ? "yesterday"
            : "this_week";
      const label =
        key === "today" ? "Hoy" : key === "yesterday" ? "Ayer" : "Esta semana";
      const existing = groupMap.get(key);
      if (existing) existing.items.push(item);
      else groupMap.set(key, { key, label, items: [item] });
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
  return { items: filtered };
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
      items: g.items.filter((i) => pageIds.has(i.id)),
    }))
    .filter((g) => g.items.length > 0);
}

export type InboxQueryArgs = {
  items: readonly WorkItem[];
  view: InboxView;
  now?: Date;
  limit?: number;
  /** Opaque cursor or raw item id of the last item on the previous page. */
  cursor?: string;
};

export function queryInbox(args: InboxQueryArgs): InboxQueryResult {
  const now = args.now ?? new Date();
  const counters = { needs_you: countNeedsYou(args.items) };
  const full = buildFullView(args.items, args.view, now);
  const pageOpts: { limit?: number; cursor?: string } = {};
  if (args.limit !== undefined) pageOpts.limit = args.limit;
  if (args.cursor !== undefined) pageOpts.cursor = args.cursor;
  const { page, next_cursor, has_more } = paginateItems(full.items, pageOpts);
  const pageIds = new Set(page.map((i) => i.id));
  const result: InboxQueryResult = {
    view: args.view,
    items: page,
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
  if (full.sections) result.sections = sliceSections(full.sections, pageIds);
  if (full.groups) result.groups = sliceGroups(full.groups, pageIds);
  return result;
}

export type InboxSyncArgs = {
  items: readonly WorkItem[];
  view: InboxView;
  since: string;
  now?: Date;
};

export function buildInboxSync(args: InboxSyncArgs): InboxSyncResult {
  const now = args.now ?? new Date();
  const counters = { needs_you: countNeedsYou(args.items) };
  const full = buildFullView(args.items, args.view, now);
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
): Set<string> {
  return new Set(buildFullView(items, view, now).items.map((i) => i.id));
}
