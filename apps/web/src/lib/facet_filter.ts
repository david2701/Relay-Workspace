import { getDisplayContext } from "./display_context";
import type { Status, WorkItem } from "./types";
import type { DueFacet, UrlFacets } from "./url_state";
import { USER_ACTOR_ID } from "./url_state";
import {
  addZoneDays,
  startOfZoneDay,
  zoneDayDiff,
} from "./zone_time";

/** Ball-holder (P3): needs_you counts as user. */
export function ballHolderId(item: WorkItem): string | null {
  if (item.status === "needs_you") return USER_ACTOR_ID;
  if (item.assignee_type === "user") return USER_ACTOR_ID;
  if (item.assignee_type === "agent") return item.assignee_id;
  return null;
}

function zoneDayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function matchesDue(
  item: WorkItem,
  due: DueFacet,
  from: string | null,
  to: string | null,
  now: Date,
  timeZone: string,
): boolean {
  const dueAt = item.due_at ? new Date(item.due_at) : null;
  if (due === "none") return dueAt === null;
  if (!dueAt) return false;
  const today = zoneDayKey(now, timeZone);
  const dueDay = zoneDayKey(dueAt, timeZone);
  if (due === "today") return dueDay === today;
  if (due === "overdue") return dueAt.getTime() < now.getTime() && dueDay < today;
  if (due === "week") {
    const start = startOfZoneDay(now, timeZone);
    const end = addZoneDays(start, 7, timeZone);
    return dueAt.getTime() >= start.getTime() && dueAt.getTime() <= end.getTime();
  }
  if (due === "range") {
    if (from && dueDay < from) return false;
    if (to && dueDay > to) return false;
    return true;
  }
  return true;
}

/** Client-side facet filter (offline / no search API). AND across facets. */
export function itemMatchesFacets(
  item: WorkItem,
  facets: UrlFacets,
  now: Date = new Date(),
): boolean {
  const timeZone = getDisplayContext().timezone;
  if (facets.status.length > 0) {
    if (!facets.status.includes(item.status as Status)) return false;
  }
  if (facets.actor.length > 0) {
    const holder = ballHolderId(item);
    if (!holder || !facets.actor.includes(holder)) return false;
  }
  if (facets.due) {
    if (!matchesDue(item, facets.due, facets.from, facets.to, now, timeZone)) {
      return false;
    }
  }
  return true;
}

export { zoneDayDiff };
