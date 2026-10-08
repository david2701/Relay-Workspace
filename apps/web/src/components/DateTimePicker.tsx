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
import {
  dstMessage,
  formatParsePreview,
  parseNaturalDate,
} from "../lib/date_parse";
import {
  formatDateTimeAccessible,
  formatDateTimeField,
} from "../lib/format";
import {
  dateOnlyParisIso,
  fromParisWall,
  fromParisWallDetailed,
  isDateOnly,
  PARIS_TZ,
  type ParisWall,
  toParisParts,
} from "../lib/paris_time";
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
    return PARIS_TZ;
  }
}

function showTzHint(iso: string | null, dst?: boolean): boolean {
  if (dst) return true;
  if (browserTz() !== PARIS_TZ) return true;
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
  const [narrow, setNarrow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const now = useMemo(() => new Date(), [open]);

  const parts = draft ? toParisParts(new Date(draft)) : null;
  const [viewY, setViewY] = useState(() => parts?.y ?? toParisParts(now).y);
  const [viewM, setViewM] = useState(() => parts?.m ?? toParisParts(now).m);
  const [focusDay, setFocusDay] = useState(() => {
    const p = parts ?? toParisParts(now);
    return { y: p.y, m: p.m, d: p.d };
  });

  const shortcuts = useMemo(
    () =>
      buildShortcuts({
        kind,
        now,
        value: draft,
        relatedDueAt,
      }),
    [kind, now, draft, relatedDueAt],
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
        ? fromParisWallDetailed({
            y: toParisParts(new Date(draft)).y,
            m: toParisParts(new Date(draft)).m,
            d: toParisParts(new Date(draft)).d,
            hh: toParisParts(new Date(draft)).hh,
            mm: toParisParts(new Date(draft)).mm,
          }).dst
        : undefined;

  const pastWarn =
    previewIso && new Date(previewIso).getTime() < now.getTime()
      ? "Esta fecha ya pasó. Puedes guardarla igual."
      : null;

  const afterDueWarn =
    kind === "reminder" &&
    previewIso &&
    relatedDueAt &&
    new Date(previewIso).getTime() > new Date(relatedDueAt).getTime()
      ? "El aviso llega después de la fecha límite."
      : null;

  useEffect(() => {
    if (open) return;
    setDraft(value);
    setInputText(value ? formatDateTimeField(value) : "");
    setNoTime(value ? isDateOnly(value) : kind === "due");
    setParseError(null);
    setAlertError(null);
    if (value) {
      const p = toParisParts(new Date(value));
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
      const pickerW = Math.min(420, vw - 32);
      const spaceBelow = vh - r.bottom;
      const isNarrow = vw < 768 || vw - 32 < pickerW + 32;
      setNarrow(isNarrow);
      if (isNarrow) {
        setPos(null);
        return;
      }
      const top =
        spaceBelow < 360 && r.top > spaceBelow
          ? r.top - 8
          : r.bottom + 4;
      const left = Math.max(8, r.right - pickerW);
      setPos({
        top: spaceBelow < 360 && r.top > spaceBelow ? top : top,
        left,
      });
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

  function openPicker() {
    if (disabled || readOnly) return;
    setOpen(true);
    setDraft(value);
    const formatted = value ? formatDateTimeField(value) : "";
    setInputText(formatted);
    setNoTime(value ? isDateOnly(value) : allowDateOnly);
    setParseError(null);
    setAlertError(null);
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
      triggerRef.current?.select();
    });
  }

  function cancelClose() {
    setDraft(value);
    setInputText(value ? formatDateTimeField(value) : "");
    setOpen(false);
    setParseError(null);
    setAlertError(null);
    triggerRef.current?.focus();
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
      setError("No se guardó el cambio. Reintentar");
      setDraft(value);
      setInputText(value ? formatDateTimeField(value) : "");
    } finally {
      setBusy(false);
      triggerRef.current?.focus();
    }
  }

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
          setParseError("¿Hora o día? Escribe 15h o 15/10.");
          setAlertError("¿Hora o día? Escribe 15h o 15/10.");
          return;
        }
        setParseError(
          "No entiendo esa fecha. Prueba: mañana 9, vie 14:30 o 15/10.",
        );
        setAlertError(
          "No entiendo esa fecha. Prueba: mañana 9, vie 14:30 o 15/10.",
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
    const cur = draft ? toParisParts(new Date(draft)) : null;
    let hh = cur && !isDateOnly(draft!) ? cur.hh : kind === "reminder" ? 9 : 23;
    let mm = cur && !isDateOnly(draft!) ? cur.mm : kind === "reminder" ? 0 : 59;
    const dateOnly = noTime && allowDateOnly;
    if (dateOnly) {
      hh = 23;
      mm = 59;
    }
    const wall: ParisWall = { y, m, d, hh, mm };
    const iso = dateOnly
      ? dateOnlyParisIso(y, m, d)
      : fromParisWall(wall).toISOString();
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
      const p = toParisParts(now);
      const [hh, mm] = hhmm.split(":").map(Number);
      const iso = fromParisWall({
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
    const p = toParisParts(new Date(draft!));
    const [hh, mm] = hhmm.split(":").map(Number);
    const iso = fromParisWall({
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
    const p = toParisParts(new Date(draft));
    if (checked) {
      const iso = dateOnlyParisIso(p.y, p.m, p.d);
      setDraft(iso);
      setInputText(formatDateTimeField(iso));
    } else {
      const iso = fromParisWall({
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

  const emptyLabel = kind === "due" ? "Sin fecha" : "Sin aviso";
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
      aria-label={`Elegir fecha: ${label}`}
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
      {narrow ? <div className="dtp-scrim" aria-hidden /> : null}
      <div className={`dtp-popover-inner${narrow ? " sheet-inner" : ""}`}>
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
                  <span className="dtp-tz"> hora de París</span>
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
                    y: toParisParts(new Date(draft)).y,
                    m: toParisParts(new Date(draft)).m,
                    d: toParisParts(new Date(draft)).d,
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
          <TimeCombobox
            value={
              draft && !noTime
                ? `${pad(toParisParts(new Date(draft)).hh)}:${pad(toParisParts(new Date(draft)).mm)}`
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
              Sin hora
            </label>
          ) : null}
          <button
            type="button"
            className="linkish"
            onClick={() => void commit(null)}
          >
            {kind === "due" ? "Quitar fecha" : "Quitar aviso"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void confirmDraft()}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={`dtp${disabled ? " disabled" : ""}`}>
      <span className="dtp-label">
        {icon} {label}
        {savedFlash ? <span className="dtp-saved mono"> Guardado</span> : null}
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
              ? "Escribe: mañana 9, vie 14:30, 15/10…"
              : emptyLabel
          }
          title={
            disabled
              ? "Sin conexión con la API local"
              : tzHint && value
                ? `${formatDateTimeField(value)} · hora de París`
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
            Reintentar
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
