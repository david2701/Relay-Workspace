import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

type Props = {
  label: string;
  values: ReactNode;
  ariaRemove: string;
  onRemove: () => void;
};

export function FilterChip({ label, values, ariaRemove, onRemove }: Props) {
  return (
    <button
      type="button"
      className="filter-chip"
      aria-label={ariaRemove}
      onClick={onRemove}
      onKeyDown={(e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          onRemove();
        }
      }}
    >
      <span className="filter-chip-text">
        <span className="filter-chip-facet">{label}:</span> {values}
      </span>
      <X size={12} weight="bold" aria-hidden className="filter-chip-x" />
    </button>
  );
}
