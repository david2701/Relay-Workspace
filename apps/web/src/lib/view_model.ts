import { matchesQuery } from "./normalize";
import type { InboxResult, InboxView, WorkItem } from "./types";

export type ViewSection = {
  key: string;
  label: string;
  items: WorkItem[];
};

export type LingerRow = {
  item: WorkItem;
  fromView: InboxView;
  until: number;
};

export function dedupeItems(items: readonly WorkItem[]): WorkItem[] {
  const seen = new Set<string>();
  const out: WorkItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function assertNoDuplicateIds(
  sections: readonly ViewSection[],
  context: string,
): void {
  const seen = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (seen.has(item.id)) {
        throw new Error(
          `Duplicate item id "${item.id}" in rendered view ${context}`,
        );
      }
      seen.add(item.id);
    }
  }
}

function isAgentWipStatus(status: string): boolean {
  return (
    status === "assigned" || status === "in_progress" || status === "blocked"
  );
}

/** Title-only fallback (offline / no search API). Accent-insensitive. */
export function matchesFilter(item: WorkItem, filter: string): boolean {
  if (!filter.trim()) return true;
  return matchesQuery(item.title, filter);
}

function passesFilter(
  item: WorkItem,
  filter: string,
  allowedIds: ReadonlySet<string> | null | undefined,
): boolean {
  if (allowedIds) return allowedIds.has(item.id);
  return matchesFilter(item, filter);
}

/**
 * Single source of truth for list rows + section counts.
 * Only uses inbox when inbox.view matches the active view.
 * Linger is view-scoped and never duplicates an id already in the inbox payload.
 * When `allowedIds` is set (server search), it replaces the title filter.
 */
export function buildViewSections(args: {
  inbox: InboxResult | null;
  inboxView: InboxView;
  lingerRows: readonly LingerRow[];
  pendingRows: readonly WorkItem[];
  filter: string;
  allowedIds?: ReadonlySet<string> | null;
  now?: number;
}): ViewSection[] {
  const now = args.now ?? Date.now();
  if (!args.inbox || args.inbox.view !== args.inboxView) return [];
  const inboxIds = new Set(args.inbox.items.map((i) => i.id));
  const linger = args.lingerRows.filter(
    (r) =>
      r.fromView === args.inboxView &&
      r.until > now &&
      !inboxIds.has(r.item.id),
  );
  const filter = args.filter;
  const allowedIds = args.allowedIds;
  if (args.inboxView === "attention" && args.inbox.sections) {
    return args.inbox.sections.map((section) => {
      const sectionIds = new Set(section.items.map((i) => i.id));
      const lingerInSection = linger
        .map((r) => r.item)
        .filter((i) => {
          if (sectionIds.has(i.id)) return false;
          if (section.key === "needs_you") return i.status === "needs_you";
          if (section.key === "blocked") return i.status === "blocked";
          return i.status !== "needs_you" && i.status !== "blocked";
        });
      const items = dedupeItems([...lingerInSection, ...section.items]).filter(
        (i) => passesFilter(i, filter, allowedIds),
      );
      return {
        key: section.key,
        label:
          section.key === "needs_you"
            ? "Te necesita"
            : section.key === "blocked"
              ? "Atascado"
              : "Para hoy",
        items,
      };
    });
  }
  if (args.inbox.groups && args.inbox.groups.length > 0) {
    const groupedIds = new Set(
      args.inbox.groups.flatMap((g) => g.items.map((i) => i.id)),
    );
    // For done/upcoming: linger only if status still belongs in this view.
    const orphanLinger = linger
      .map((r) => r.item)
      .filter((i) => {
        if (groupedIds.has(i.id)) return false;
        if (args.inboxView === "done") {
          return i.status === "done" || i.status === "cancelled";
        }
        return true;
      });
    return args.inbox.groups.map((group, index) => {
      const items = dedupeItems([
        ...(index === 0 ? orphanLinger : []),
        ...group.items,
      ]).filter((i) => passesFilter(i, filter, allowedIds));
      if (args.inboxView === "done") {
        const terminal = items.filter(
          (i) => i.status === "done" || i.status === "cancelled",
        );
        return { key: group.key, label: group.label, items: terminal };
      }
      return { key: group.key, label: group.label, items };
    });
  }
  // Flat views: agent_wip / all
  let base = args.inbox.items;
  if (args.inboxView === "agent_wip") {
    base = base.filter(
      (i) => i.assignee_type === "agent" && isAgentWipStatus(i.status),
    );
  }
  const pending = args.pendingRows.filter((p) => !inboxIds.has(p.id));
  const lingerItems = linger
    .map((r) => r.item)
    .filter((i) => {
      if (args.inboxView === "agent_wip") {
        // Never linger needs_you / inbox / done into Con agentes.
        return i.assignee_type === "agent" && isAgentWipStatus(i.status);
      }
      return true;
    });
  const items = dedupeItems([...lingerItems, ...pending, ...base]).filter((i) =>
    passesFilter(i, filter, allowedIds),
  );
  return [{ key: "all", label: "", items }];
}
