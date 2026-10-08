import type { WorkItem } from "../schemas/work_item.js";
import {
  addParisDays,
  endOfParisWeek,
  parisDayDiff,
  parisWeekday,
  startOfParisDay,
} from "./paris_time.js";

export type DueGroupKey =
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "none";

export const DUE_GROUP_LABELS: Record<DueGroupKey, string> = {
  overdue: "Vencidas",
  today: "Hoy",
  tomorrow: "Mañana",
  week: "Esta semana",
  later: "Más adelante",
  none: "Sin fecha",
};

export const DUE_GROUP_ORDER: DueGroupKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "none",
];

/** Classify an open item by `due_at` frontiers in Europe/Paris (Todo Fecha). */
export function classifyDue(
  dueAt: string | null,
  status: WorkItem["status"],
  now = new Date(),
): DueGroupKey {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  const open = status !== "done" && status !== "cancelled";
  if (due.getTime() < now.getTime() && open) return "overdue";

  const dayDiff = parisDayDiff(dueAt, now);
  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "tomorrow";

  const tomorrow = addParisDays(startOfParisDay(now), 1);
  const tomorrowIsMonday = parisWeekday(tomorrow) === 1;
  if (!tomorrowIsMonday && dayDiff >= 2) {
    const weekEnd = endOfParisWeek(now);
    if (due.getTime() <= weekEnd.getTime()) return "week";
  }
  return "later";
}

export type DueGroupCount = {
  key: DueGroupKey;
  label: string;
  count: number;
};

/**
 * Server totals for Todo date groups (all open items, not just the page).
 * Precomputes Paris day bounds once — avoids per-item Intl work at 10k.
 */
export function countDueGroups(
  items: readonly WorkItem[],
  now = new Date(),
): DueGroupCount[] {
  const counts = new Map<DueGroupKey, number>();
  for (const key of DUE_GROUP_ORDER) counts.set(key, 0);

  const nowMs = now.getTime();
  const todayStart = startOfParisDay(now);
  const tomorrowStart = addParisDays(todayStart, 1);
  const dayAfterTomorrow = addParisDays(todayStart, 2);
  const tomorrowIsMonday = parisWeekday(tomorrowStart) === 1;
  const weekEndMs = endOfParisWeek(now).getTime();
  const tomorrowStartMs = tomorrowStart.getTime();
  const dayAfterMs = dayAfterTomorrow.getTime();

  for (const item of items) {
    if (item.status === "done" || item.status === "cancelled") continue;
    if (!item.due_at) {
      counts.set("none", (counts.get("none") ?? 0) + 1);
      continue;
    }
    const dueMs = Date.parse(item.due_at);
    if (Number.isNaN(dueMs)) {
      counts.set("none", (counts.get("none") ?? 0) + 1);
      continue;
    }
    let key: DueGroupKey;
    if (dueMs < nowMs) {
      key = "overdue";
    } else if (dueMs < tomorrowStartMs) {
      key = "today";
    } else if (dueMs < dayAfterMs) {
      key = "tomorrow";
    } else if (!tomorrowIsMonday && dueMs <= weekEndMs) {
      key = "week";
    } else {
      key = "later";
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return DUE_GROUP_ORDER.map((key) => ({
    key,
    label: DUE_GROUP_LABELS[key],
    count: counts.get(key) ?? 0,
  })).filter((g) => g.count > 0);
}
