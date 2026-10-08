import { CaretRight, Check } from "@phosphor-icons/react";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useActorLabels } from "../hooks/useActorLabels";
import { useT } from "../i18n/I18nProvider";
import { markForActor } from "../lib/actor_mark";
import { dueFacetLabel, statusLabel } from "../lib/copy";
import type { Agent, Status } from "../lib/types";
import {
  DUE_VALUES,
  type DueFacet,
  STATUS_ORDER,
  type UrlFacets,
  USER_ACTOR_ID,
} from "../lib/url_state";
import { ActorMark } from "./ActorMark";

export type FacetKey = "status" | "actor" | "due";

export function dueLabels(t: ReturnType<typeof useT>): Record<DueFacet, string> {
  return {
    overdue: dueFacetLabel(t, "overdue"),
    today: dueFacetLabel(t, "today"),
    week: dueFacetLabel(t, "week"),
    none: dueFacetLabel(t, "none"),
    range: dueFacetLabel(t, "range"),
  };
}

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  agents: Agent[];
  facets: UrlFacets;
  hideOwner?: boolean | undefined;
  onClose: () => void;
  onChange: (facets: UrlFacets) => void;
};

export function FacetMenu({
  open,
  anchorRef,
  agents,
  facets,
  hideOwner,
  onClose,
  onChange,
}: Props) {
  const t = useT();
  const actorLabels = useActorLabels();
  const DUE_LABELS = useMemo(() => dueLabels(t), [t]);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<FacetKey | null>(null);
  const [filterText, setFilterText] = useState("");
  const [focusIndex, setFocusIndex] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const topItems = useMemo(() => {
    const items: { key: FacetKey; label: string }[] = [
      { key: "status", label: t("facet.status") },
    ];
    if (!hideOwner) items.push({ key: "actor", label: t("facet.owner") });
    items.push({ key: "due", label: t("facet.due") });
    return items;
  }, [hideOwner, t]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const menuW = 280;
    let left = rect.right - menuW;
    if (left < 8) left = 8;
    setPos({ top: rect.bottom + 4, left });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) {
      setSubmenu(null);
      setFilterText("");
      setFocusIndex(0);
      return;
    }
    setFocusIndex(0);
    const t = window.setTimeout(() => {
      rootRef.current?.querySelector<HTMLElement>("[data-facet-item]")?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  function toggleStatus(s: Status) {
    const has = facets.status.includes(s);
    const status = has
      ? facets.status.filter((x) => x !== s)
      : [...facets.status, s];
    onChange({ ...facets, status });
  }

  function toggleActor(id: string) {
    const has = facets.actor.includes(id);
    const actor = has
      ? facets.actor.filter((x) => x !== id)
      : [...facets.actor, id];
    onChange({ ...facets, actor });
  }

  function setDue(due: DueFacet | null) {
    if (due === facets.due) {
      onChange({ ...facets, due: null, from: null, to: null });
      return;
    }
    onChange({
      ...facets,
      due,
      from: due === "range" ? facets.from : null,
      to: due === "range" ? facets.to : null,
    });
  }

  const norm = filterText.trim().toLowerCase();

  const sl = (s: Status) => statusLabel(t, s);
  const statusOptions = STATUS_ORDER.filter((s) =>
    norm ? sl(s).toLowerCase().includes(norm) : true,
  );
  const actorOptions = [
    { id: USER_ACTOR_ID, label: t("facet.you") },
    ...agents.map((a) => ({ id: a.id, label: a.display_name })),
  ].filter((a) => (norm ? a.label.toLowerCase().includes(norm) : true));
  const dueOptions = DUE_VALUES.filter((d) =>
    norm ? DUE_LABELS[d].toLowerCase().includes(norm) : true,
  );

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (submenu) {
        setSubmenu(null);
        setFilterText("");
        setFocusIndex(0);
        return;
      }
      onClose();
      anchorRef.current?.focus();
      return;
    }
    if (submenu) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSubmenu(null);
        setFilterText("");
        return;
      }
      // typing filters values
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setFilterText((t) => t + e.key);
        return;
      }
      if (e.key === "Backspace") {
        setFilterText((t) => t.slice(0, -1));
        return;
      }
      const list =
        submenu === "status"
          ? statusOptions
          : submenu === "actor"
            ? actorOptions
            : dueOptions;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(list.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const idx = focusIndex;
        if (submenu === "status") {
          const s = statusOptions[idx];
          if (s) toggleStatus(s);
        } else if (submenu === "actor") {
          const a = actorOptions[idx];
          if (a) toggleActor(a.id);
        } else {
          const d = dueOptions[idx];
          if (d) setDue(d);
        }
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((i) => Math.min(topItems.length - 1, i + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((i) => Math.max(0, i - 1));
    }
    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      const item = topItems[focusIndex];
      if (item) {
        setSubmenu(item.key);
        setFocusIndex(0);
        setFilterText("");
      }
    }
  }

  return createPortal(
    <div
      ref={rootRef}
      id={menuId}
      className="facet-menu"
      role="menu"
      aria-label={t("facet.filters")}
      style={{ top: pos.top, left: pos.left }}
      onKeyDown={onKeyDown}
    >
      {!submenu
        ? topItems.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-facet-item
              aria-haspopup="menu"
              className={`facet-menu-item${i === focusIndex ? " focus" : ""}`}
              tabIndex={i === focusIndex ? 0 : -1}
              onMouseEnter={() => setFocusIndex(i)}
              onClick={() => {
                setSubmenu(item.key);
                setFocusIndex(0);
                setFilterText("");
              }}
            >
              <span>{item.label}</span>
              <CaretRight size={12} aria-hidden />
            </button>
          ))
        : null}

      {submenu === "status"
        ? statusOptions.map((s, i) => {
            const checked = facets.status.includes(s);
            return (
              <button
                key={s}
                type="button"
                role="menuitemcheckbox"
                data-facet-item
                aria-checked={checked}
                className={`facet-menu-item${i === focusIndex ? " focus" : ""}`}
                tabIndex={i === focusIndex ? 0 : -1}
                onMouseEnter={() => setFocusIndex(i)}
                onClick={() => toggleStatus(s)}
              >
                <span className="facet-check">
                  {checked ? <Check size={14} weight="bold" /> : null}
                </span>
                <span>{sl(s)}</span>
              </button>
            );
          })
        : null}

      {submenu === "actor"
        ? actorOptions.map((a, i) => {
            const checked = facets.actor.includes(a.id);
            const mark =
              a.id === USER_ACTOR_ID
                ? markForActor("user", USER_ACTOR_ID, agents, actorLabels)
                : markForActor("agent", a.id, agents, actorLabels);
            return (
              <button
                key={a.id}
                type="button"
                role="menuitemcheckbox"
                data-facet-item
                aria-checked={checked}
                className={`facet-menu-item${i === focusIndex ? " focus" : ""}`}
                tabIndex={i === focusIndex ? 0 : -1}
                onMouseEnter={() => setFocusIndex(i)}
                onClick={() => toggleActor(a.id)}
              >
                <span className="facet-check">
                  {checked ? <Check size={14} weight="bold" /> : null}
                </span>
                <ActorMark
                  kind={mark.kind}
                  name={mark.name}
                  monogram={mark.monogram}
                  size={14}
                />
                <span>{a.label}</span>
              </button>
            );
          })
        : null}

      {submenu === "due"
        ? dueOptions.map((d, i) => {
            const checked = facets.due === d;
            return (
              <button
                key={d}
                type="button"
                role="menuitemradio"
                data-facet-item
                aria-checked={checked}
                className={`facet-menu-item${i === focusIndex ? " focus" : ""}`}
                tabIndex={i === focusIndex ? 0 : -1}
                onMouseEnter={() => setFocusIndex(i)}
                onClick={() => setDue(d)}
              >
                <span className="facet-check">
                  {checked ? <Check size={14} weight="bold" /> : null}
                </span>
                <span>{DUE_LABELS[d]}</span>
              </button>
            );
          })
        : null}

      {submenu === "due" && facets.due === "range" ? (
        <div className="facet-range" role="group" aria-label={t("facet.rangeGroupAria")}>
          <label>
            {t("facet.rangeFrom")}
            <input
              type="date"
              value={facets.from ?? ""}
              onChange={(e) =>
                onChange({ ...facets, from: e.target.value || null })
              }
            />
          </label>
          <label>
            {t("facet.rangeTo")}
            <input
              type="date"
              value={facets.to ?? ""}
              onChange={(e) =>
                onChange({ ...facets, to: e.target.value || null })
              }
            />
          </label>
        </div>
      ) : null}

      {submenu && filterText ? (
        <div className="facet-filter-hint mono" aria-live="polite">
          {filterText}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

