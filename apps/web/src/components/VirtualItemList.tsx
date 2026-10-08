import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { DateGroupKey } from "../lib/date_groups";
import type { Agent, SearchMatch, WorkItem } from "../lib/types";
import type { ViewSection } from "../lib/view_model";
import { DateGroupHeader } from "./DateGroupHeader";
import { ItemRow } from "./ItemRow";

const HEADER_H = 28;
const ROW_H = 36;
const ROW_H_REASON = 52;
const ROW_H_SNIPPET = 68;
/** Below this row count, render nested groups so role=group contains options (AC3/e2e). */
const VIRTUALIZE_THRESHOLD = 80;

export type VirtualRow =
  | {
      type: "header";
      key: string;
      label: string;
      count: number;
      sectionKey: string;
    }
  | { type: "item"; key: string; item: WorkItem; sectionKey: string };

function hasReason(item: WorkItem): boolean {
  return (
    (item.status === "needs_you" && !!item.needs_you_reason) ||
    (item.status === "blocked" && !!item.blocked_reason)
  );
}

function hasSnippet(
  item: WorkItem,
  matches?: ReadonlyMap<string, SearchMatch>,
): boolean {
  const m = matches?.get(item.id);
  return !!m && m.field !== "title";
}

function sectionCount(section: ViewSection): number {
  return section.count ?? section.items.length;
}

export function flattenSections(
  sections: ViewSection[],
  collapsedKeys?: ReadonlySet<string>,
): VirtualRow[] {
  const rows: VirtualRow[] = [];
  for (const section of sections) {
    if (section.label) {
      rows.push({
        type: "header",
        key: `hdr:${section.key}`,
        label: section.label,
        count: sectionCount(section),
        sectionKey: section.key,
      });
    }
    if (collapsedKeys?.has(section.key)) continue;
    for (const item of section.items) {
      rows.push({
        type: "item",
        key: item.id,
        item,
        sectionKey: section.key,
      });
    }
  }
  return rows;
}

function estimateSize(
  row: VirtualRow,
  matches?: ReadonlyMap<string, SearchMatch>,
): number {
  if (row.type === "header") return HEADER_H;
  if (hasSnippet(row.item, matches)) return ROW_H_SNIPPET;
  return hasReason(row.item) ? ROW_H_REASON : ROW_H;
}

type Props = {
  scrollRef: RefObject<HTMLDivElement | null>;
  sections: ViewSection[];
  agents: Agent[];
  selectedId: string | null;
  flashIds: Set<string>;
  showChatBadge?: boolean;
  showCompletedBy?: boolean;
  collapsedKeys?: ReadonlySet<string> | undefined;
  onToggleGroup?: ((key: string) => void) | undefined;
  dueGroupMode?: boolean | undefined;
  matches?: ReadonlyMap<string, SearchMatch> | undefined;
  onSelect: (id: string) => void;
  /** Near-end scroll → load next cursor page. */
  onLoadMore?: (() => void) | undefined;
  hasMore?: boolean | undefined;
};

type ItemRowRenderProps = {
  agents: Agent[];
  selectedId: string | null;
  flashIds: Set<string>;
  showChatBadge?: boolean | undefined;
  showCompletedBy?: boolean | undefined;
  dueGroupMode?: boolean | undefined;
  sectionKey: string;
  matches?: ReadonlyMap<string, SearchMatch> | undefined;
  onSelect: (id: string) => void;
};

function renderItemRow(item: WorkItem, props: ItemRowRenderProps): ReactNode {
  return (
    <ItemRow
      item={item}
      agents={props.agents}
      selected={props.selectedId === item.id}
      flash={props.flashIds.has(item.id)}
      {...(props.dueGroupMode ? { dueGroupKey: props.sectionKey } : {})}
      {...(props.showChatBadge !== undefined
        ? { showChatBadge: props.showChatBadge }
        : {})}
      {...(props.showCompletedBy !== undefined
        ? { showCompletedBy: props.showCompletedBy }
        : {})}
      {...(props.matches?.get(item.id)
        ? { match: props.matches.get(item.id) }
        : {})}
      onSelect={props.onSelect}
    />
  );
}

export function VirtualItemList({
  scrollRef,
  sections,
  agents,
  selectedId,
  flashIds,
  showChatBadge,
  showCompletedBy,
  collapsedKeys,
  onToggleGroup,
  dueGroupMode,
  matches,
  onSelect,
  onLoadMore,
  hasMore,
}: Props) {
  const rows = useMemo(
    () => flattenSections(sections, collapsedKeys),
    [sections, collapsedKeys],
  );
  const useVirtual = rows.length > VIRTUALIZE_THRESHOLD;
  // Fixed-size estimates only — no measureElement (avoids ResizeObserver thrash).
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateSize(rows[index]!, matches),
    overscan: 12,
    getItemKey: (index) => rows[index]?.key ?? index,
  });
  const seenFlash = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!useVirtual) return;
    for (const id of flashIds) {
      if (seenFlash.current.has(id)) continue;
      seenFlash.current.add(id);
      const index = rows.findIndex((r) => r.type === "item" && r.item.id === id);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: "center" });
      }
    }
    for (const id of [...seenFlash.current]) {
      if (!flashIds.has(id)) seenFlash.current.delete(id);
    }
  }, [flashIds, rows, useVirtual, virtualizer]);

  // Infinite scroll: request next page when near the end of loaded rows.
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < 600) onLoadMore();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [onLoadMore, hasMore, scrollRef, rows.length]);

  const itemProps = {
    agents,
    selectedId,
    flashIds,
    showChatBadge,
    showCompletedBy,
    dueGroupMode,
    matches,
    onSelect,
  };

  if (!useVirtual) {
    return (
      <div className="nested-list">
        {sections.map((section) => {
          const collapsed = !!collapsedKeys?.has(section.key);
          const items = collapsed ? [] : section.items;
          const count = sectionCount(section);
          if (!section.label) {
            return (
              <div key={section.key || "all"}>
                {items.map((item) => (
                  <div key={item.id}>
                    {renderItemRow(item, {
                      ...itemProps,
                      sectionKey: section.key,
                    })}
                  </div>
                ))}
              </div>
            );
          }
          if (dueGroupMode && onToggleGroup) {
            return (
              <div key={section.key}>
                <DateGroupHeader
                  groupKey={section.key as DateGroupKey}
                  label={section.label}
                  count={count}
                  collapsed={collapsed}
                  onToggle={() => onToggleGroup(section.key)}
                />
                {items.map((item) => (
                  <div key={item.id}>
                    {renderItemRow(item, {
                      ...itemProps,
                      sectionKey: section.key,
                    })}
                  </div>
                ))}
              </div>
            );
          }
          return (
            <Section
              key={section.key}
              label={section.label}
              count={count}
            >
              {items.map((item) =>
                renderItemRow(item, {
                  ...itemProps,
                  sectionKey: section.key,
                }),
              )}
            </Section>
          );
        })}
      </div>
    );
  }

  const vItems = virtualizer.getVirtualItems();
  return (
    <div
      className="virtual-list"
      data-virtualized="true"
      style={{
        height: virtualizer.getTotalSize(),
        width: "100%",
        position: "relative",
        contain: "content",
      }}
    >
      {vItems.map((vRow) => {
        const row = rows[vRow.index]!;
        return (
          <div
            key={row.key}
            data-index={vRow.index}
            className="virtual-row"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: vRow.size,
              transform: `translateY(${vRow.start}px)`,
              contain: "layout style",
            }}
          >
            {row.type === "header" ? (
              dueGroupMode && onToggleGroup ? (
                <DateGroupHeader
                  groupKey={row.sectionKey as DateGroupKey}
                  label={row.label}
                  count={row.count}
                  collapsed={!!collapsedKeys?.has(row.sectionKey)}
                  onToggle={() => onToggleGroup(row.sectionKey)}
                />
              ) : (
                <Section label={row.label} count={row.count} virtualized />
              )
            ) : (
              renderItemRow(row.item, {
                ...itemProps,
                sectionKey: row.sectionKey,
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Section label + count from the data model (not mounted children). */
export function Section({
  label,
  count,
  virtualized,
  children,
}: {
  label: string;
  count: number;
  virtualized?: boolean;
  children?: ReactNode;
}) {
  if (!label && count === 0 && !children) return null;
  return (
    <div
      role="group"
      aria-label={label || undefined}
      data-section-count={count}
      data-virtualized={virtualized ? "true" : undefined}
    >
      {label ? (
        <div className="section-label label-caps">
          {label}
          <span className="mono" data-section-count-text>
            {" "}
            · {count}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
