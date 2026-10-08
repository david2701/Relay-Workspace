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
        count: section.items.length,
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
      onSelect={() => props.onSelect(item.id)}
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
}: Props) {
  const rows = useMemo(
    () => flattenSections(sections, collapsedKeys),
    [sections, collapsedKeys],
  );
  const useVirtual = rows.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateSize(rows[index]!, matches),
    overscan: 8,
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
    // Drop ids no longer flashing so a later re-flash can scroll again.
    for (const id of [...seenFlash.current]) {
      if (!flashIds.has(id)) seenFlash.current.delete(id);
    }
  }, [flashIds, rows, useVirtual, virtualizer]);
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
                  count={section.items.length}
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
              count={section.items.length}
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

  return (
    <div
      className="virtual-list"
      data-virtualized="true"
      style={{
        height: virtualizer.getTotalSize(),
        width: "100%",
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map((vRow) => {
        const row = rows[vRow.index]!;
        return (
          <div
            key={row.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            className="virtual-row"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vRow.start}px)`,
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
