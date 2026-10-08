import { getDisplayContext } from "./display_context";
import type { MessageKey } from "../i18n/types";
import type { WorkItem } from "./types";
import {
  addZoneDays,
  endOfZoneWeek,
  isDateOnlyInZone,
  startOfZoneDay,
  zoneDayDiff,
  zoneWeekday,
} from "./zone_time";

export type DateGroupKey =
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "none";

export type DateGroup = {
  key: DateGroupKey;
  labelKey: MessageKey;
  items: WorkItem[];
};

export const DATE_GROUP_LABEL_KEYS: Record<DateGroupKey, MessageKey> = {
  overdue: "group.overdue",
  today: "group.today",
  tomorrow: "group.tomorrow",
  week: "group.week",
  later: "group.later",
  none: "group.none",
};

const GROUP_ORDER: DateGroupKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "none",
];

function tz(): string {
  return getDisplayContext().timezone;
}

function isOpen(item: WorkItem): boolean {
  return item.status !== "done" && item.status !== "cancelled";
}

export function classifyDue(
  dueAt: string | null,
  status: WorkItem["status"],
  now = new Date(),
): DateGroupKey {
  const timeZone = tz();
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
        new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime(),
    );
    return copy;
  }
  if (key === "later") {
    copy.sort((a, b) => {
      const da = a.due_at ? new Date(a.due_at).getTime() : 0;
      const db = b.due_at ? new Date(b.due_at).getTime() : 0;
      return da - db;
    });
    return copy;
  }
  copy.sort(
    (a, b) =>
      new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime(),
  );
  return copy;
}

export function groupByDue(
  items: WorkItem[],
  now = new Date(),
): DateGroup[] {
  const buckets = new Map<DateGroupKey, WorkItem[]>();
  for (const key of GROUP_ORDER) buckets.set(key, []);
  for (const item of items) {
    if (!isOpen(item) && !item.due_at) continue;
    const key = classifyDue(item.due_at, item.status, now);
    buckets.get(key)?.push(item);
  }
  return GROUP_ORDER.map((key) => ({
    key,
    labelKey: DATE_GROUP_LABEL_KEYS[key],
    items: sortWithin(key, buckets.get(key) ?? []),
  })).filter((g) => g.items.length > 0);
}

export function isDateOnly(iso: string): boolean {
  return isDateOnlyInZone(iso, tz());
}
