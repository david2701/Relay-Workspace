import type { InboxResult, InboxSyncDelta, WorkItem } from "./types";

/** Spec: needs_you / blocked oldest-first (updated_at ASC). */
function byUpdatedAsc(a: WorkItem, b: WorkItem): number {
  return a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0;
}

/** Rebuild Atención sections from a flat item list (view already filtered). */
export function rebuildAttentionSections(
  items: WorkItem[],
): NonNullable<InboxResult["sections"]> {
  const needs_you = items
    .filter((i) => i.status === "needs_you")
    .sort(byUpdatedAsc);
  const blocked = items
    .filter((i) => i.status === "blocked")
    .sort(byUpdatedAsc);
  const today = items.filter(
    (i) => i.status !== "needs_you" && i.status !== "blocked",
  );
  return [
    { key: "needs_you", items: needs_you },
    { key: "blocked", items: blocked },
    { key: "today", items: today },
  ];
}

function mergeGroups(
  prev: NonNullable<InboxResult["groups"]>,
  itemsById: Map<string, WorkItem>,
  removed: Set<string>,
  upserts: WorkItem[],
): NonNullable<InboxResult["groups"]> {
  const covered = new Set<string>();
  const groups = prev.map((group) => {
    const nextItems: WorkItem[] = [];
    for (const item of group.items) {
      if (removed.has(item.id)) continue;
      const fresh = itemsById.get(item.id);
      if (fresh) {
        nextItems.push(fresh);
        covered.add(item.id);
      }
    }
    return { ...group, items: nextItems };
  });
  // New upserts not already in a group land in the first group.
  const orphans = upserts.filter(
    (u) => !removed.has(u.id) && !covered.has(u.id),
  );
  const first = groups[0];
  if (orphans.length > 0 && first) {
    groups[0] = {
      key: first.key,
      label: first.label,
      items: [...orphans, ...first.items],
    };
  }
  return groups;
}

/**
 * Apply an incremental inbox delta onto the previous snapshot.
 * Attention sections are rebuilt from merged items; other views keep
 * group membership where possible and append new upserts to the first group.
 */
export function applyInboxDelta(
  prev: InboxResult,
  delta: InboxSyncDelta,
): InboxResult {
  const removed = new Set(delta.removed_ids);
  const upsertById = new Map(delta.upserts.map((u) => [u.id, u]));

  const merged: WorkItem[] = [];
  const seen = new Set<string>();
  for (const item of prev.items) {
    if (removed.has(item.id)) continue;
    const up = upsertById.get(item.id);
    if (up) {
      merged.push(up);
      seen.add(item.id);
    } else {
      merged.push(item);
      seen.add(item.id);
    }
  }
  for (const up of delta.upserts) {
    if (removed.has(up.id) || seen.has(up.id)) continue;
    merged.push(up);
    seen.add(up.id);
  }

  const itemsById = new Map(merged.map((i) => [i.id, i]));
  const next: InboxResult = {
    ...prev,
    items: merged,
    counters: delta.counters,
    sync_cursor: delta.sync_cursor,
  };
  if (delta.server_time !== undefined) next.server_time = delta.server_time;
  if (delta.total_count !== undefined) next.total_count = delta.total_count;
  if (delta.section_counts !== undefined) {
    next.section_counts = delta.section_counts;
  }
  if (delta.group_counts !== undefined) {
    next.group_counts = delta.group_counts;
  }

  if (prev.view === "attention" || prev.sections) {
    // Keep spec oldest-first order; VirtualItemList scrolls flash ids into view.
    next.sections = rebuildAttentionSections(merged);
    next.items = next.sections.flatMap((s) => s.items);
  }
  if (prev.groups) {
    next.groups = mergeGroups(prev.groups, itemsById, removed, delta.upserts);
  }

  return next;
}

/** True when the response is a usable incremental delta. */
export function isInboxDelta(
  payload: InboxResult | InboxSyncDelta,
): payload is InboxSyncDelta {
  return (
    (payload as InboxSyncDelta).mode === "delta" &&
    typeof (payload as InboxSyncDelta).sync_cursor === "string" &&
    Array.isArray((payload as InboxSyncDelta).upserts) &&
    Array.isArray((payload as InboxSyncDelta).removed_ids)
  );
}

/** Ensure Atención snapshots always expose sections (paged API may omit them). */
export function ensureAttentionSections(snap: InboxResult): InboxResult {
  if (snap.view !== "attention") return snap;
  if (snap.sections && snap.sections.length > 0) return snap;
  const sections = rebuildAttentionSections(snap.items);
  return { ...snap, sections, items: sections.flatMap((s) => s.items) };
}
