import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type ReactNode,
  type RefObject,
  useMemo,
} from "react";
import type { DateGroupKey } from "../lib/date_groups";
import type { Agent, WorkItem } from "../lib/types";
import type { ViewSection } from "../lib/view_model";
import { DateGroupHeader } from "./DateGroupHeader";
import { ItemRow } from "./ItemRow";

const HEADER_H = 28;
const ROW_H = 36;
const ROW_H_REASON = 52;

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

function estimateSize(row: VirtualRow): number {
  if (row.type === "header") return HEADER_H;
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
  /** When set, section headers are collapsible date groups. */
  collapsedKeys?: ReadonlySet<string> | undefined;
  onToggleGroup?: ((key: string) => void) | undefined;
  dueGroupMode?: boolean | undefined;
  onSelect: (id: string) => void;
};

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
  onSelect,
}: Props) {
  const rows = useMemo(
    () => flattenSections(sections, collapsedKeys),
    [sections, collapsedKeys],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateSize(rows[index]!),
    overscan: 8,
  });

  return (
    <div
      className="virtual-list"
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
                <Section
                  label={row.label}
                  count={row.count}
                  virtualized
                />
              )
            ) : (
              <ItemRow
                item={row.item}
                agents={agents}
                selected={selectedId === row.item.id}
                flash={flashIds.has(row.item.id)}
                {...(dueGroupMode
                  ? { dueGroupKey: row.sectionKey }
                  : {})}
                {...(showChatBadge !== undefined
                  ? { showChatBadge }
                  : {})}
                {...(showCompletedBy !== undefined
                  ? { showCompletedBy }
                  : {})}
                onSelect={() => onSelect(row.item.id)}
              />
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
