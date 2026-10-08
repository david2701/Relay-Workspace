import type { WorkItem } from "../schemas/work_item.js";
import {
  addZoneDays,
  endOfZoneWeek,
  startOfZoneDay,
  zoneDayDiff,
  zoneWeekday,
} from "./zone_time.js";

export type DueGroupKey =
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "none";

/**
 * Stable group codes for API/MCP. UI maps key → locale `group.*` keys.
 * Do not put user-visible prose here — check:hardcoded-strings scans this file.
 */
export const DUE_GROUP_LABELS: Record<DueGroupKey, string> = {
  overdue: "overdue",
  today: "today",
  tomorrow: "tomorrow",
  week: "week",
  later: "later",
  none: "none",
};

export const DUE_GROUP_ORDER: DueGroupKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "none",
];

/** Classify an open item by `due_at` frontiers in `timeZone` (Todo Fecha). */
export function classifyDue(
  dueAt: string | null,
  status: WorkItem["status"],
  now = new Date(),
  timeZone = "UTC",
): DueGroupKey {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  const open = status !== "done" && status !== "cancelled";
  if (due.getTime() < now.getTime() && open) return "overdue";

  const dayDiff = zoneDayDiff(dueAt, timeZone, now);
  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "tomorrow";

  const tomorrow = addZoneDays(startOfZoneDay(now, timeZone), 1, timeZone);
  const tomorrowIsMonday = zoneWeekday(tomorrow, timeZone) === 1;
  if (!tomorrowIsMonday && dayDiff >= 2) {
    const weekEnd = endOfZoneWeek(now, timeZone);
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
 * Precomputes zone day bounds once — avoids per-item Intl work at 10k.
 */
export function countDueGroups(
  items: readonly WorkItem[],
  now = new Date(),
  timeZone = "UTC",
): DueGroupCount[] {
  const counts = new Map<DueGroupKey, number>();
  for (const key of DUE_GROUP_ORDER) counts.set(key, 0);

  const nowMs = now.getTime();
  const todayStart = startOfZoneDay(now, timeZone);
  const tomorrowStart = addZoneDays(todayStart, 1, timeZone);
  const dayAfterTomorrow = addZoneDays(todayStart, 2, timeZone);
  const tomorrowIsMonday = zoneWeekday(tomorrowStart, timeZone) === 1;
  const weekEndMs = endOfZoneWeek(now, timeZone).getTime();
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
