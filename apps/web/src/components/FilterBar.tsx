import { type RefObject, useRef, useState } from "react";
import { useActorLabels } from "../hooks/useActorLabels";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/types";
import { markForActor } from "../lib/actor_mark";
import { dueFacetLabel, statusLabel } from "../lib/copy";
import type { Agent } from "../lib/types";
import { 
  facetCount,
  hasActiveFacets,
  type UrlFacets,USER_ACTOR_ID, } from "../lib/url_state";
import { ActorMark } from "./ActorMark";
import { dueLabels, FacetMenu } from "./FacetMenu";
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
  const t = useT();
  const actorLabels = useActorLabels();
  const DUE_LABELS = dueLabels(t);
  const sl = (s: import("../lib/types").Status) => statusLabel(t, s);
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
            {n > 0 ? t("filter.titleCount", { count: n }) : t("filter.title")}
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
          aria-label={t("filter.active")}
        >
          {facets.status.length > 0 ? (
            <FilterChip
              label={t("facet.status")}
              values={facets.status.map((s) => sl(s)).join(", ")}
              ariaRemove={t("facet.removeFilter", {
                label: `${t("facet.status")} ${facets.status.map((s) => sl(s)).join(", ")}`,
              })}
              onRemove={() => onFacetsChange({ ...facets, status: [] })}
            />
          ) : null}
          {facets.actor.length > 0 && !hideOwner ? (
            <FilterChip
              label={t("facet.owner")}
              values={
                <span className="chip-actors">
                  {facets.actor.map((id) => {
                    const mark =
                      id === USER_ACTOR_ID
                        ? markForActor("user", USER_ACTOR_ID, agents, actorLabels)
                        : markForActor("agent", id, agents, actorLabels);
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
              ariaRemove={t("facet.removeFilter", {
                label: `${t("facet.owner")} ${facets.actor.join(", ")}`,
              })}
              onRemove={() => onFacetsChange({ ...facets, actor: [] })}
            />
          ) : null}
          {facets.due ? (
            <FilterChip
              label={t("facet.due")}
              values={
                facets.due === "range" && (facets.from || facets.to)
                  ? `${facets.from ?? "…"} → ${facets.to ?? "…"}`
                  : DUE_LABELS[facets.due]
              }
              ariaRemove={t("facet.removeFilter", {
                label: `${t("facet.due")} ${DUE_LABELS[facets.due]}`,
              })}
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
            {t("facet.clear")}
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
