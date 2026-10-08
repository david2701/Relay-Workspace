import { CaretRight } from "@phosphor-icons/react";
import type { DateGroupKey } from "../lib/date_groups";

type Props = {
  groupKey: DateGroupKey;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
};

export function DateGroupHeader({
  groupKey,
  label,
  count,
  collapsed,
  onToggle,
}: Props) {
  return (
    <button
      type="button"
      className={`date-group-header label-caps${collapsed ? " collapsed" : ""}`}
      data-group-key={groupKey}
      aria-expanded={!collapsed}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" && !collapsed) {
          e.preventDefault();
          onToggle();
        }
        if (e.key === "ArrowRight" && collapsed) {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <CaretRight size={12} className="date-group-chevron" aria-hidden />
      <span>{label}</span>
      <span className="mono" data-section-count-text>
        · {count}
      </span>
    </button>
  );
}
