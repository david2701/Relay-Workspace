import type { WorkItem } from "../schemas/work_item.js";
import type { InboxView } from "../schemas/enums.js";
import type { InboxQueryResult } from "../schemas/inbox.js";
import {
  addDays,
  endOfLocalDay,
  startOfLocalDay,
} from "./time.js";

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
  const today = startOfLocalDay(now);
  const target = startOfLocalDay(date);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return { key: "today", label: "Hoy" };
  if (diffDays === 1) return { key: "tomorrow", label: "Mañana" };
  if (diffDays === -1) return { key: "yesterday", label: "Ayer" };
  if (diffDays > 1 && diffDays < 7) {
    return {
      key: `dow-${diffDays}`,
      label: WEEKDAY_ES[date.getDay()] ?? "día",
    };
  }
  if (diffDays < -1 && diffDays > -7) {
    return { key: "this_week", label: "Esta semana" };
  }
  return { key: "this_week", label: "Esta semana" };
}

export type InboxQueryArgs = {
  items: readonly WorkItem[];
  view: InboxView;
  now?: Date;
};

export function queryInbox(args: InboxQueryArgs): InboxQueryResult {
  const now = args.now ?? new Date();
  const counters = { needs_you: countNeedsYou(args.items) };
  if (args.view === "attention") {
    const needsYou = args.items
      .filter((i) => i.status === "needs_you")
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    const blocked = args.items
      .filter((i) => i.status === "blocked")
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    const endToday = endOfLocalDay(now);
    const today = args.items
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
    return {
      view: "attention",
      items: [...needsYou, ...blocked, ...today],
      sections: [
        { key: "needs_you", items: needsYou },
        { key: "blocked", items: blocked },
        { key: "today", items: today },
      ],
      counters,
    };
  }
  if (args.view === "agent_wip") {
    const order = { in_progress: 0, assigned: 1, blocked: 2 } as const;
    const items = args.items
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
    return { view: "agent_wip", items, counters };
  }
  if (args.view === "upcoming") {
    const horizon = addDays(endOfLocalDay(now), 7);
    const items = args.items
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
    const groupMap = new Map<string, { key: string; label: string; items: WorkItem[] }>();
    for (const item of items) {
      const near = nearestSchedule(item);
      if (!near) continue;
      const g = groupLabel(near, now);
      const existing = groupMap.get(g.key);
      if (existing) existing.items.push(item);
      else groupMap.set(g.key, { ...g, items: [item] });
    }
    return {
      view: "upcoming",
      items,
      groups: [...groupMap.values()],
      counters,
    };
  }
  if (args.view === "done") {
    const weekAgo = addDays(startOfLocalDay(now), -7);
    const items = args.items
      .filter((i) => {
        if (!isTerminal(i) || !i.completed_at) return false;
        return new Date(i.completed_at).getTime() >= weekAgo.getTime();
      })
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    const groupMap = new Map<string, { key: string; label: string; items: WorkItem[] }>();
    for (const item of items) {
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
      .filter((g): g is NonNullable<typeof g> => g !== undefined);
    return { view: "done", items, groups, counters };
  }
  // all
  const items = args.items
    .filter((i) => !isTerminal(i))
    .sort((a, b) => {
      if (a.status === "inbox" && b.status !== "inbox") return -1;
      if (b.status === "inbox" && a.status !== "inbox") return 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  return { view: "all", items, counters };
}
