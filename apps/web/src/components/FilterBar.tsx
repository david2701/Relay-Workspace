import { type RefObject, useRef, useState } from "react";
import { markForActor } from "../lib/actor_mark";
import { copy } from "../lib/copy";
import type { Agent } from "../lib/types";
import {
  facetCount,
  hasActiveFacets,
  type UrlFacets,
} from "../lib/url_state";
import { ActorMark } from "./ActorMark";
import { DUE_LABELS, FacetMenu } from "./FacetMenu";
import { FilterChip } from "./FilterChip";
import { SearchField } from "./SearchField";
import "./FilterBar.css";

type Props = {
  q: string;
  facets: UrlFacets;
  agents: Agent[];
  offline?: boolean;
  searching?: boolean;
  searchError?: string | null;
  countLive?: string | null;
  hideFacets?: boolean;
  hideOwner?: boolean;
  placeholder?: string;
  onQueryChange: (q: string) => void;
  onFacetsChange: (facets: UrlFacets) => void;
  onClear: () => void;
  onFocusFirstResult?: () => void;
  facetsOpen?: boolean;
  onFacetsOpenChange?: (open: boolean) => void;
};

export function FilterBar({
  q,
  facets,
  agents,
  offline,
  searching,
  searchError,
  countLive,
  hideFacets,
  hideOwner,
  placeholder,
  onQueryChange,
  onFacetsChange,
  onClear,
  onFocusFirstResult,
  facetsOpen: controlledOpen,
  onFacetsOpenChange,
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    onFacetsOpenChange?.(v);
    if (controlledOpen === undefined) setInternalOpen(v);
  };
  const n = facetCount(facets);
  const showChips = hasActiveFacets(facets);

  return (
    <div className="filter-bar">
      <div className="filter-bar-row">
        <SearchField
          value={q}
          placeholder={placeholder}
          disabled={!!offline}
          searching={searching}
          error={searchError}
          countText={countLive}
          onChange={onQueryChange}
          onClear={() => onQueryChange("")}
          onEnter={onFocusFirstResult}
          onEscape={() => {
            const list = document.querySelector<HTMLElement>(".item-list");
            list?.focus();
          }}
          onArrowDown={onFocusFirstResult}
        />
        {!hideFacets ? (
          <button
            ref={btnRef}
            type="button"
            className="btn-secondary filter-btn"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-keyshortcuts="F"
            onClick={() => setOpen(!open)}
          >
            {n > 0 ? `Filtros · ${n}` : "Filtros"}
            <kbd className="filter-btn-kbd" aria-hidden>
              F
            </kbd>
          </button>
        ) : null}
      </div>

      {showChips || q.trim() ? (
        <div
          className="filter-chips"
          role="group"
          aria-label="Filtros activos"
        >
          {facets.status.length > 0 ? (
            <FilterChip
              label="Estado"
              values={facets.status.map((s) => copy.statusLabel[s]).join(", ")}
              ariaRemove={`Quitar filtro: Estado ${facets.status.map((s) => copy.statusLabel[s]).join(", ")}`}
              onRemove={() => onFacetsChange({ ...facets, status: [] })}
            />
          ) : null}
          {facets.actor.length > 0 && !hideOwner ? (
            <FilterChip
              label="Dueño"
              values={
                <span className="chip-actors">
                  {facets.actor.map((id) => {
                    const mark =
                      id === "david"
                        ? markForActor("user", "david", agents)
                        : markForActor("agent", id, agents);
                    return (
                      <span key={id} className="chip-actor">
                        <ActorMark
                          kind={mark.kind}
                          name={mark.name}
                          monogram={mark.monogram}
                          size={14}
                        />
                        {mark.monogram || mark.name}
                      </span>
                    );
                  })}
                </span>
              }
              ariaRemove={`Quitar filtro: Dueño ${facets.actor.join(", ")}`}
              onRemove={() => onFacetsChange({ ...facets, actor: [] })}
            />
          ) : null}
          {facets.due ? (
            <FilterChip
              label="Vence"
              values={
                facets.due === "range" && (facets.from || facets.to)
                  ? `${facets.from ?? "…"} → ${facets.to ?? "…"}`
                  : DUE_LABELS[facets.due]
              }
              ariaRemove={`Quitar filtro: Vence ${DUE_LABELS[facets.due]}`}
              onRemove={() =>
                onFacetsChange({
                  ...facets,
                  due: null,
                  from: null,
                  to: null,
                })
              }
            />
          ) : null}
          <button type="button" className="linkish filter-clear" onClick={onClear}>
            Limpiar
          </button>
        </div>
      ) : null}

      {!hideFacets ? (
        <FacetMenu
          open={open}
          anchorRef={btnRef as RefObject<HTMLElement | null>}
          agents={agents}
          facets={facets}
          hideOwner={hideOwner}
          onClose={() => setOpen(false)}
          onChange={onFacetsChange}
        />
      ) : null}
    </div>
  );
}
