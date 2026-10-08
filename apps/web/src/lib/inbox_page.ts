import { rebuildAttentionSections } from "./inbox_merge";
import type { InboxResult, WorkItem } from "./types";

/** First-page size for web inbox fetches (keeps payload ≪ 200 KB at 10k). */
export const INBOX_PAGE_SIZE = 50;

/**
 * Atención first page: cover Te necesita + Atascado entirely (modest seed:
 * 80 + 120) so oldest-first MCP mutations at section ends are in-window.
 * Capped at the API max page size (200).
 */
export const ATTENTION_PAGE_SIZE = 200;

/** Append a cursor page onto an existing snapshot without duplicating ids. */
export function appendInboxPage(
  prev: InboxResult,
  page: InboxResult,
): InboxResult {
  const seen = new Set(prev.items.map((i) => i.id));
  const additions = page.items.filter((i) => !seen.has(i.id));
  const items = [...prev.items, ...additions];

  const next: InboxResult = {
    ...prev,
    items,
    next_cursor: page.next_cursor ?? null,
    has_more: Boolean(page.has_more),
  };
  if (page.total_count !== undefined) next.total_count = page.total_count;
  if (page.counters) next.counters = page.counters;
  if (page.section_counts) next.section_counts = page.section_counts;
  if (page.group_counts) next.group_counts = page.group_counts;
  if (page.sync_cursor) next.sync_cursor = page.sync_cursor;
  if (page.server_time) next.server_time = page.server_time;

  if (prev.view === "attention" || prev.sections || page.sections) {
    next.sections = rebuildAttentionSections(items);
  }
  if (prev.groups || page.groups) {
    next.groups = mergeFlatGroups(prev.groups, page.groups, additions);
  }
  return next;
}

function mergeFlatGroups(
  prev: InboxResult["groups"],
  page: InboxResult["groups"],
  additions: WorkItem[],
): NonNullable<InboxResult["groups"]> {
  if (!prev?.length && !page?.length) return [];
  if (!prev?.length) return page ?? [];
  if (!page?.length) return prev;
  const byKey = new Map(prev.map((g) => [g.key, { ...g, items: [...g.items] }]));
  for (const group of page) {
    const existing = byKey.get(group.key);
    if (!existing) {
      byKey.set(group.key, { ...group, items: [...group.items] });
      continue;
    }
    const seen = new Set(existing.items.map((i) => i.id));
    for (const item of group.items) {
      if (seen.has(item.id)) continue;
      existing.items.push(item);
      seen.add(item.id);
    }
  }
  // Orphan additions (no group key from page) go into the first group.
  if (additions.length > 0) {
    const covered = new Set(
      [...byKey.values()].flatMap((g) => g.items.map((i) => i.id)),
    );
    const orphans = additions.filter((a) => !covered.has(a.id));
    const first = byKey.values().next().value;
    if (orphans.length > 0 && first) {
      first.items = [...orphans, ...first.items];
    }
  }
  return [...byKey.values()];
}
