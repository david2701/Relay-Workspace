import type { Status, WorkItem } from "./types";
import type { DueFacet, UrlFacets } from "./url_state";

const USER_ACTOR_ID = "david";

/** Ball-holder (P3): needs_you counts as david. */
export function ballHolderId(item: WorkItem): string | null {
  if (item.status === "needs_you") return USER_ACTOR_ID;
  if (item.assignee_type === "user") return USER_ACTOR_ID;
  if (item.assignee_type === "agent") return item.assignee_id;
  return null;
}

function parisDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
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
): boolean {
  const dueAt = item.due_at ? new Date(item.due_at) : null;
  if (due === "none") return dueAt === null;
  if (!dueAt) return false;
  const today = parisDayKey(now);
  const dueDay = parisDayKey(dueAt);
  if (due === "today") return dueDay === today;
  if (due === "overdue") return dueAt.getTime() < now.getTime() && dueDay < today;
  if (due === "week") {
    // Rough: due within next 7 Paris calendar days from start of today
    const start = new Date(`${today}T00:00:00+02:00`);
    const end = new Date(start.getTime() + 7 * 86400000);
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
  if (facets.status.length > 0) {
    if (!facets.status.includes(item.status as Status)) return false;
  }
  if (facets.actor.length > 0) {
    const holder = ballHolderId(item);
    if (!holder || !facets.actor.includes(holder)) return false;
  }
  if (facets.due) {
    if (!matchesDue(item, facets.due, facets.from, facets.to, now)) {
      return false;
    }
  }
  return true;
}
