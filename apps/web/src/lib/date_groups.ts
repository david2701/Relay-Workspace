import {
  addParisDays,
  endOfParisWeek,
  isDateOnly,
  parisDayDiff,
  parisWeekday,
  startOfParisDay,
} from "./paris_time";
import type { WorkItem } from "./types";

export type DateGroupKey =
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "none";

export type DateGroup = {
  key: DateGroupKey;
  label: string;
  items: WorkItem[];
};

export const DATE_GROUP_LABELS: Record<DateGroupKey, string> = {
  overdue: "Vencidas",
  today: "Hoy",
  tomorrow: "Mañana",
  week: "Esta semana",
  later: "Más adelante",
  none: "Sin fecha",
};

const GROUP_ORDER: DateGroupKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "none",
];

function isOpen(item: WorkItem): boolean {
  return item.status !== "done" && item.status !== "cancelled";
}

export function classifyDue(
  dueAt: string | null,
  status: WorkItem["status"],
  now = new Date(),
): DateGroupKey {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  const open = status !== "done" && status !== "cancelled";
  if (due.getTime() < now.getTime() && open) return "overdue";

  const dayDiff = parisDayDiff(dueAt, now);
  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "tomorrow";

  // "Esta semana": from day-after-tomorrow through this Sunday.
  // Hidden when tomorrow is already Monday (today is Sunday).
  const tomorrow = addParisDays(startOfParisDay(now), 1);
  const tomorrowIsMonday = parisWeekday(tomorrow) === 1;

  if (!tomorrowIsMonday && dayDiff >= 2) {
    const weekEnd = endOfParisWeek(now);
    if (due.getTime() <= weekEnd.getTime()) return "week";
  }
  return "later";
}

function sortWithin(key: DateGroupKey, items: WorkItem[]): WorkItem[] {
  const copy = [...items];
  if (key === "none") {
    copy.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    return copy;
  }
  if (key === "overdue") {
    copy.sort(
      (a, b) =>
        new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime(),
    );
    return copy;
  }
  if (key === "today" || key === "tomorrow") {
    copy.sort((a, b) => {
      const aOnly = isDateOnly(a.due_at!);
      const bOnly = isDateOnly(b.due_at!);
      if (aOnly !== bOnly) return aOnly ? 1 : -1;
      return new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime();
    });
    return copy;
  }
  copy.sort(
    (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime(),
  );
  return copy;
}

/** Group open Todo items by due_at frontiers in Europe/Paris. */
export function groupByDue(items: readonly WorkItem[], now = new Date()): DateGroup[] {
  const buckets = new Map<DateGroupKey, WorkItem[]>();
  for (const key of GROUP_ORDER) buckets.set(key, []);

  for (const item of items) {
    const key = classifyDue(item.due_at, item.status, now);
    buckets.get(key)!.push(item);
  }

  // Drop "week" entirely when tomorrow is Monday
  const tomorrow = addParisDays(startOfParisDay(now), 1);
  if (parisWeekday(tomorrow) === 1) {
    const weekItems = buckets.get("week") ?? [];
    if (weekItems.length) {
      buckets.get("later")!.push(...weekItems);
      buckets.set("week", []);
    }
  }

  const out: DateGroup[] = [];
  for (const key of GROUP_ORDER) {
    const list = sortWithin(key, buckets.get(key) ?? []);
    if (list.length === 0) continue;
    out.push({ key, label: DATE_GROUP_LABELS[key], items: list });
  }
  return out;
}

export function isOpenItem(item: WorkItem): boolean {
  return isOpen(item);
}
