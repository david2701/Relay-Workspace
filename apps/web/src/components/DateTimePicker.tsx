import { CaretDown } from "@phosphor-icons/react";
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n/I18nProvider";
import {
  type ActiveWall,
  activeTimezone,
  activeTimezoneLabel,
  dateOnlyActiveIso,
  fromActiveWall,
  fromActiveWallDetailed,
  isDateOnly,
  toActiveParts,
} from "../lib/active_zone";
import {
  dstMessage,
  formatParsePreview,
  parseNaturalDate,
} from "../lib/date_parse";
import { getDisplayContext } from "../lib/display_context";
import {
  formatDateTimeAccessible,
  formatDateTimeField,
} from "../lib/format";
import { CalendarGrid } from "./CalendarGrid";
import { buildShortcuts, PickerShortcuts, type Shortcut } from "./PickerShortcuts";
import { TimeCombobox } from "./TimeCombobox";
import "./DateTimePicker.css";

export type DateTimePickerKind = "due" | "reminder";

type Props = {
  label: string;
  icon?: ReactNode;
  kind: DateTimePickerKind;
  value: string | null;
  allowDateOnly?: boolean;
  relatedDueAt?: string | null;
  readOnly?: boolean;
  disabled?: boolean;
  /** Imperative open request from App (T / Shift+T). */
  requestOpen?: boolean;
  onRequestOpenHandled?: (() => void) | undefined;
  onCommit: (next: string | null) => Promise<void>;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return activeTimezone();
  }
}

function showTzHint(iso: string | null, dst?: boolean): boolean {
  if (dst) return true;
  if (browserTz() !== getDisplayContext().timezone) return true;
  return false;
}

export function DateTimePicker({
  label,
  icon,
  kind,
  value,
  allowDateOnly = kind === "due",
  relatedDueAt = null,
  readOnly,
  disabled,
  requestOpen,
  onRequestOpenHandled,
  onCommit,
}: Props) {
  const t = useT();
  const id = useId();
  const dialogId = `${id}-dialog`;
  const previewId = `${id}-preview`;
  const triggerRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [inputText, setInputText] = useState(
    value ? formatDateTimeField(value) : "",
  );
  const [noTime, setNoTime] = useState(
    value ? isDateOnly(value) : kind === "due",
  );
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [shortcutIdx, setShortcutIdx] = useState(0);
  // Seed from viewport so sheet mode does not briefly take the desktop (focus-trigger) path.
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const now = useMemo(() => new Date(), [open]);

  const parts = draft ? toActiveParts(new Date(draft)) : null;
  const [viewY, setViewY] = useState(() => parts?.y ?? toActiveParts(now).y);
  const [viewM, setViewM] = useState(() => parts?.m ?? toActiveParts(now).m);
  const [focusDay, setFocusDay] = useState(() => {
    const p = parts ?? toActiveParts(now);
    return { y: p.y, m: p.m, d: p.d };
  });

  const shortcuts = useMemo(
    () =>
      buildShortcuts({
        kind,
        now,
        value: draft,
        relatedDueAt,
        t,
      }),
    [kind, now, draft, relatedDueAt, t],
  );

  const liveParse = useMemo(() => {
    if (!inputText.trim()) return null;
    // Don't re-parse the formatted display string as natural language while idle
    if (draft && inputText === formatDateTimeField(draft)) return null;
    return parseNaturalDate(inputText, { now, kind });
  }, [inputText, now, kind, draft]);

  const previewIso =
    liveParse?.ok === true
      ? liveParse.iso
      : draft;
  const previewDateOnly =
    liveParse?.ok === true
      ? liveParse.dateOnly
      : draft
        ? isDateOnly(draft)
        : false;

  const dstNote =
    liveParse?.ok === true
      ? liveParse.dst
      : draft
        ? fromActiveWallDetailed({
            y: toActiveParts(new Date(draft)).y,
            m: toActiveParts(new Date(draft)).m,
            d: toActiveParts(new Date(draft)).d,
            hh: toActiveParts(new Date(draft)).hh,
            mm: toActiveParts(new Date(draft)).mm,
          }).dst
        : undefined;

  const pastWarn =
    previewIso && new Date(previewIso).getTime() < now.getTime()
      ? t("picker.pastDateWarn")
      : null;

  const afterDueWarn =
    kind === "reminder" &&
    previewIso &&
    relatedDueAt &&
    new Date(previewIso).getTime() > new Date(relatedDueAt).getTime()
      ? t("picker.afterDueWarn")
      : null;

  const ambiguousMsg = `${t("picker.ambiguous")} ${t("picker.ambiguousHint")}`;
  const tzLabel = t("picker.tzHint", { zone: activeTimezoneLabel() });

  useEffect(() => {
    if (open) return;
    setDraft(value);
    setInputText(value ? formatDateTimeField(value) : "");
    setNoTime(value ? isDateOnly(value) : kind === "due");
    setParseError(null);
    setAlertError(null);
    if (value) {
      const p = toActiveParts(new Date(value));
      setViewY(p.y);
      setViewM(p.m);
      setFocusDay({ y: p.y, m: p.m, d: p.d });
    }
  }, [value, kind, open]);

  useEffect(() => {
    if (requestOpen && !disabled && !readOnly) {
      openPicker();
      onRequestOpenHandled?.();
    }
  }, [requestOpen]);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const trig = triggerRef.current;
      if (!trig) return;
      const r = trig.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pickerW = Math.min(580, vw - 32);
      const spaceBelow = vh - r.bottom;
      // Spec §1.3.7: sheet when viewport < 768 or free width < picker + 2×space-4.
      // Also sheet when the detail overlay is full-bleed (≤1023) and can't fit the popover.
      const isNarrow =
        vw < 768 || vw - 32 < pickerW + 32 || (vw <= 1023 && vw < pickerW + 48);
      setNarrow(isNarrow);
      if (isNarrow) {
        setPos(null);
        return;
      }
      const openUp = spaceBelow < 360 && r.top > spaceBelow;
      const top = openUp ? Math.max(8, r.top - 8) : r.bottom + 4;
      // Anchor to trigger’s right edge; clamp so the popover stays in the viewport.
      let left = r.right - pickerW;
      left = Math.min(left, vw - pickerW - 8);
      left = Math.max(8, left);
      setPos({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (
        popoverRef.current?.contains(t) ||
        triggerRef.current?.contains(t)
      ) {
        return;
      }
      void confirmDraft();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, draft, noTime, inputText]);

  // Bottom sheet (V12-D16): inert background + document-level Tab trap.
  useEffect(() => {
    if (!open || !narrow) return;
    const appRoot = document.getElementById("root");
    if (appRoot) appRoot.inert = true;
    return () => {
      if (appRoot) appRoot.inert = false;
    };
  }, [open, narrow]);

  useEffect(() => {
    if (!open || !narrow) return;
    const root = popoverRef.current;
    if (!root) return;

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const focusable = () =>
      [...root.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (el) => {
          if (el.closest("[inert]")) return false;
          if (el.getAttribute("aria-hidden") === "true") return false;
          // offsetParent is null for fixed/positioned nodes in some engines —
          // fall back to client rects.
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        },
      );

    // Move focus into the sheet (never leave it on the trigger behind).
    requestAnimationFrame(() => {
      const nodes = focusable();
      (nodes[0] ?? root).focus?.();
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusable();
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const i = active ? nodes.indexOf(active) : -1;
      if (e.shiftKey) {
        e.preventDefault();
        const prev = i <= 0 ? nodes[nodes.length - 1] : nodes[i - 1];
        prev?.focus();
      } else {
        e.preventDefault();
        const next = i === -1 || i >= nodes.length - 1 ? nodes[0] : nodes[i + 1];
        next?.focus();
      }
    }
    // Capture on document so Tab cannot escape to inert/non-inert siblings.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, narrow]);

  function openPicker() {
    if (disabled || readOnly) return;
    setOpen(true);
    setDraft(value);
    const formatted = value ? formatDateTimeField(value) : "";
    setInputText(formatted);
    setNoTime(value ? isDateOnly(value) : allowDateOnly);
    setParseError(null);
    setAlertError(null);
  }

  // Desktop popover is non-modal: the combobox trigger stays the active input.
  // Sheet focus is owned by the trap effect (never the trigger behind the scrim).
  useEffect(() => {
    if (!open || narrow) return;
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
      triggerRef.current?.select();
    });
  }, [open, narrow]);

  function cancelClose() {
    setDraft(value);
    setInputText(value ? formatDateTimeField(value) : "");
    setOpen(false);
    setParseError(null);
    setAlertError(null);
    // Focus returns via effect after `inert` is cleared.
  }

  async function commit(next: string | null) {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      await onCommit(next);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1000);
      setOpen(false);
      setDraft(next);
      setInputText(next ? formatDateTimeField(next) : "");
    } catch {
      setError(t("picker.saveError"));
      setDraft(value);
      setInputText(value ? formatDateTimeField(value) : "");
    } finally {
      setBusy(false);
    }
  }

  // Restore focus to the trigger after close (Esc / Listo / click-outside),
  // after sheet `inert` cleanup so the trigger is focusable again.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
    wasOpenRef.current = open;
  }, [open]);

  async function confirmDraft() {
    if (!inputText.trim()) {
      await commit(null);
      return;
    }
    if (liveParse) {
      if (!liveParse.ok) {
        if (liveParse.reason === "empty") {
          await commit(null);
          return;
        }
        if (liveParse.reason === "ambiguous") {
          setParseError(ambiguousMsg);
          setAlertError(ambiguousMsg);
          return;
        }
        setParseError(
          t("picker.parse.error"),
        );
        setAlertError(
          t("picker.parse.error"),
        );
        return;
      }
      await commit(liveParse.iso);
      return;
    }
    await commit(draft);
  }

  function applyShortcut(s: Shortcut) {
    void commit(s.iso);
  }

  function setDay(y: number, m: number, d: number) {
    const cur = draft ? toActiveParts(new Date(draft)) : null;
    let hh = cur && !isDateOnly(draft!) ? cur.hh : kind === "reminder" ? 9 : 23;
    let mm = cur && !isDateOnly(draft!) ? cur.mm : kind === "reminder" ? 0 : 59;
    const dateOnly = noTime && allowDateOnly;
    if (dateOnly) {
      hh = 23;
      mm = 59;
    }
    const wall: ActiveWall = { y, m, d, hh, mm };
    const iso = dateOnly
      ? dateOnlyActiveIso(y, m, d)
      : fromActiveWall(wall).toISOString();
    setDraft(iso);
    setInputText(formatDateTimeField(iso));
    setFocusDay({ y, m, d });
    setParseError(null);
    // Focus time field
    requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector<HTMLInputElement>(".dtp-time-input")
        ?.focus();
    });
  }

  function setTime(hhmm: string) {
    if (!draft && !parts) {
      const p = toActiveParts(now);
      const [hh, mm] = hhmm.split(":").map(Number);
      const iso = fromActiveWall({
        y: p.y,
        m: p.m,
        d: p.d,
        hh: hh ?? 0,
        mm: mm ?? 0,
      }).toISOString();
      setDraft(iso);
      setNoTime(false);
      setInputText(formatDateTimeField(iso));
      return;
    }
    const p = toActiveParts(new Date(draft!));
    const [hh, mm] = hhmm.split(":").map(Number);
    const iso = fromActiveWall({
      y: p.y,
      m: p.m,
      d: p.d,
      hh: hh ?? 0,
      mm: mm ?? 0,
    }).toISOString();
    setDraft(iso);
    setNoTime(false);
    setInputText(formatDateTimeField(iso));
  }

  function toggleNoTime(checked: boolean) {
    setNoTime(checked);
    if (!draft) return;
    const p = toActiveParts(new Date(draft));
    if (checked) {
      const iso = dateOnlyActiveIso(p.y, p.m, p.d);
      setDraft(iso);
      setInputText(formatDateTimeField(iso));
    } else {
      const iso = fromActiveWall({
        y: p.y,
        m: p.m,
        d: p.d,
        hh: 9,
        mm: 0,
      }).toISOString();
      setDraft(iso);
      setInputText(formatDateTimeField(iso));
    }
  }

  const emptyLabel =
    kind === "due" ? t("picker.noDate") : t("picker.noReminder");
  const displayValue = busy
    ? "…"
    : open
      ? inputText
      : value
        ? formatDateTimeField(value)
        : "";

  const tzHint = showTzHint(previewIso, !!dstNote);

  if (readOnly) {
    return (
      <div className="dtp">
        <span className="dtp-label">
          {icon} {label}
        </span>
        <span className="dtp-readonly mono" aria-readonly="true">
          {value ? formatDateTimeField(value) : emptyLabel}
        </span>
      </div>
    );
  }

  const popover = open ? (
    <div
      ref={popoverRef}
      id={dialogId}
      role="dialog"
      aria-modal={narrow ? true : undefined}
      aria-label={t("picker.chooseDateAria", { label })}
      tabIndex={-1}
      className={`dtp-popover${narrow ? " sheet" : ""}`}
      style={
        narrow
          ? undefined
          : pos
            ? {
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: "var(--picker-w)",
              }
            : { position: "fixed", visibility: "hidden" }
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelClose();
        }
      }}
    >
      {narrow ? (
        <div
          className="dtp-scrim"
          aria-hidden
          onMouseDown={(e) => {
            e.preventDefault();
            cancelClose();
          }}
        />
      ) : null}
      <div className={`dtp-popover-inner${narrow ? " sheet-inner" : ""}`}>
        {narrow ? (
          <>
            <div className="dtp-sheet-handle" aria-hidden />
            <button
              type="button"
              className="dtp-sheet-close"
              aria-label={t("shortcuts.close")}
              onClick={cancelClose}
            >
              ×
            </button>
          </>
        ) : null}
        <div className="dtp-preview-block">
          <div
            id={previewId}
            className="dtp-preview mono"
            aria-live="polite"
          >
            {previewIso ? (
              <>
                → {formatParsePreview(previewIso, previewDateOnly)}
                {tzHint ? (
                  <span className="dtp-tz"> {tzLabel}</span>
                ) : null}
              </>
            ) : (
              <span className="muted">→ {emptyLabel}</span>
            )}
          </div>
          {parseError ? (
            <div className="dtp-err" role="alert">
              {alertError ?? parseError}
            </div>
          ) : null}
          {dstNote ? (
            <div className="dtp-dst">{dstMessage(dstNote)}</div>
          ) : null}
          {pastWarn ? <div className="dtp-warn">{pastWarn}</div> : null}
          {afterDueWarn ? (
            <div className="dtp-warn">{afterDueWarn}</div>
          ) : null}
        </div>

        <div className="dtp-body">
          <PickerShortcuts
            shortcuts={shortcuts}
            activeIndex={shortcutIdx}
            onActiveChange={setShortcutIdx}
            onSelect={applyShortcut}
          />
          <CalendarGrid
            viewYear={viewY}
            viewMonth={viewM}
            selected={
              draft
                ? {
                    y: toActiveParts(new Date(draft)).y,
                    m: toActiveParts(new Date(draft)).m,
                    d: toActiveParts(new Date(draft)).d,
                  }
                : null
            }
            focusDay={focusDay}
            now={now}
            onViewChange={(y, m) => {
              setViewY(y);
              setViewM(m);
            }}
            onFocusDay={(y, m, d) => setFocusDay({ y, m, d })}
            onSelectDay={setDay}
          />
        </div>

        <div className="dtp-foot">
          <div className="dtp-foot-left">
            <TimeCombobox
              value={
                draft && !noTime
                  ? `${pad(toActiveParts(new Date(draft)).hh)}:${pad(toActiveParts(new Date(draft)).mm)}`
                  : ""
              }
              disabled={noTime && allowDateOnly}
              onChange={setTime}
              onConfirm={() => void confirmDraft()}
            />
            {allowDateOnly ? (
              <label className="dtp-notime">
                <input
                  type="checkbox"
                  checked={noTime}
                  onChange={(e) => toggleNoTime(e.target.checked)}
                />
                {t("picker.noTime")}
              </label>
            ) : null}
          </div>
          <div className="dtp-foot-right">
            <button
              type="button"
              className="dtp-clear"
              onClick={() => void commit(null)}
            >
              {kind === "due" ? t("picker.removeDue") : t("picker.removeReminder")}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void confirmDraft()}
            >
              {t("picker.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={`dtp${disabled ? " disabled" : ""}`}>
      <span className="dtp-label">
        {icon} {label}
        {savedFlash ? <span className="dtp-saved mono"> {t("detail.saved")}</span> : null}
      </span>
      <div className="dtp-trigger-wrap">
        <input
          ref={triggerRef}
          id={`${id}-trigger`}
          type="text"
          role="combobox"
          className={`dtp-trigger mono${parseError ? " invalid" : ""}${!value && !open ? " empty" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={dialogId}
          aria-describedby={previewId}
          aria-invalid={parseError ? true : undefined}
          aria-busy={busy || undefined}
          aria-disabled={disabled || undefined}
          aria-label={label}
          disabled={disabled}
          placeholder={
            open
              ? t("picker.input.placeholder")
              : emptyLabel
          }
          title={
            disabled
              ? t("offline.disabled")
              : tzHint && value
                ? `${formatDateTimeField(value)} · ${tzLabel}`
                : undefined
          }
          value={open ? inputText : displayValue}
          onChange={(e) => {
            if (!open) openPicker();
            setInputText(e.target.value);
            setParseError(null);
            setAlertError(null);
          }}
          onClick={() => {
            if (!open) openPicker();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || (e.altKey && e.key === "ArrowDown")) {
              e.preventDefault();
              if (!open) openPicker();
              else {
                popoverRef.current
                  ?.querySelector<HTMLButtonElement>(
                    '.dtp-day[tabindex="0"]',
                  )
                  ?.focus();
              }
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (!open) {
                openPicker();
                return;
              }
              void confirmDraft();
            }
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              cancelClose();
            }
          }}
          onFocus={() => {
            /* keep */
          }}
        />
        <CaretDown size={12} className="dtp-chevron" aria-hidden />
      </div>
      {error ? (
        <div className="dtp-err">
          {error}{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => void commit(draft)}
          >
            {t("cta.retry")}
          </button>
        </div>
      ) : null}
      <span className="sr-only" id={previewId}>
        {formatDateTimeAccessible(value, emptyLabel)}
      </span>
      {typeof document !== "undefined" && popover
        ? createPortal(popover, document.body)
        : null}
    </div>
  );
}
