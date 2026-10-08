import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef } from "react";
import { useI18n, useT } from "../i18n/I18nProvider";
import {
  addActiveDays,
  activeTimezone,
  fromActiveWall,
  startOfActiveDay,
  toActiveParts,
} from "../lib/active_zone";

type Props = {
  viewYear: number;
  viewMonth: number; // 1-12
  selected: { y: number; m: number; d: number } | null;
  focusDay: { y: number; m: number; d: number };
  now?: Date;
  onViewChange: (y: number, m: number) => void;
  onSelectDay: (y: number, m: number, d: number) => void;
  onFocusDay: (y: number, m: number, d: number) => void;
};

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function mondayOffset(y: number, m: number): number {
  // weekday of the 1st: Sun=0…Sat=6 → Mon-based 0…6
  const first = fromActiveWall({ y, m, d: 1, hh: 12, mm: 0 });
  // en-US labels only — grid layout math, not user-facing copy (TZ = settings).
  const sunBased = new Intl.DateTimeFormat("en-US", {
    timeZone: activeTimezone(),
    weekday: "short",
  }).format(first);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[sunBased] ?? 0;
}

export function CalendarGrid({
  viewYear,
  viewMonth,
  selected,
  focusDay,
  now = new Date(),
  onViewChange,
  onSelectDay,
  onFocusDay,
}: Props) {
  const t = useT();
  const { intlLocale } = useI18n();
  const labelId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const today = toActiveParts(now);
  const dim = daysInMonth(viewYear, viewMonth);
  const offset = mondayOffset(viewYear, viewMonth);

  const monthFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale, {
        timeZone: activeTimezone(),
        month: "long",
        year: "numeric",
      }),
    [intlLocale],
  );

  const monthLabel = monthFmt.format(
    fromActiveWall({ y: viewYear, m: viewMonth, d: 1, hh: 12, mm: 0 }),
  );

  const dowHeaders = useMemo(() => {
    const base = fromActiveWall({ y: 2024, m: 1, d: 1, hh: 12, mm: 0 }); // Monday
    const narrow = new Intl.DateTimeFormat(intlLocale, {
      timeZone: activeTimezone(),
      weekday: "narrow",
    });
    const long = new Intl.DateTimeFormat(intlLocale, {
      timeZone: activeTimezone(),
      weekday: "long",
    });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addActiveDays(startOfActiveDay(base), i);
      return { short: narrow.format(d), long: long.format(d) };
    });
  }, [intlLocale]);

  const dayAriaFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale, {
        timeZone: activeTimezone(),
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [intlLocale],
  );

  useEffect(() => {
    const btn = gridRef.current?.querySelector<HTMLButtonElement>(
      'button[tabindex="0"]',
    );
    if (btn && document.activeElement?.closest('[role="grid"]') === gridRef.current) {
      btn.focus();
    }
  }, [focusDay.y, focusDay.m, focusDay.d, viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    onViewChange(y, m);
    const maxD = daysInMonth(y, m);
    onFocusDay(y, m, Math.min(focusDay.d, maxD));
  }

  function moveFocus(deltaDays: number) {
    const cur = fromActiveWall({
      y: focusDay.y,
      m: focusDay.m,
      d: focusDay.d,
      hh: 12,
      mm: 0,
    });
    const next = addActiveDays(startOfActiveDay(cur), deltaDays);
    const p = toActiveParts(next);
    onFocusDay(p.y, p.m, p.d);
    if (p.y !== viewYear || p.m !== viewMonth) onViewChange(p.y, p.m);
  }

  function onGridKey(e: KeyboardEvent) {
    const key = e.key;
    if (key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(-1);
    } else if (key === "ArrowRight") {
      e.preventDefault();
      moveFocus(1);
    } else if (key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-7);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      moveFocus(7);
    } else if (key === "Home") {
      e.preventDefault();
      // Monday of this week
      const cur = fromActiveWall({
        y: focusDay.y,
        m: focusDay.m,
        d: focusDay.d,
        hh: 12,
        mm: 0,
      });
      const sunBased = new Intl.DateTimeFormat("en-US", {
        timeZone: activeTimezone(),
        weekday: "short",
      }).format(cur);
      const fromMon: Record<string, number> = {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
      };
      moveFocus(-(fromMon[sunBased] ?? 0));
    } else if (key === "End") {
      e.preventDefault();
      const cur = fromActiveWall({
        y: focusDay.y,
        m: focusDay.m,
        d: focusDay.d,
        hh: 12,
        mm: 0,
      });
      const sunBased = new Intl.DateTimeFormat("en-US", {
        timeZone: activeTimezone(),
        weekday: "short",
      }).format(cur);
      const fromMon: Record<string, number> = {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
      };
      moveFocus(6 - (fromMon[sunBased] ?? 0));
    } else if (key === "PageUp") {
      e.preventDefault();
      if (e.shiftKey) {
        onViewChange(viewYear - 1, viewMonth);
        const maxD = daysInMonth(viewYear - 1, viewMonth);
        onFocusDay(viewYear - 1, viewMonth, Math.min(focusDay.d, maxD));
      } else {
        shiftMonth(-1);
      }
    } else if (key === "PageDown") {
      e.preventDefault();
      if (e.shiftKey) {
        onViewChange(viewYear + 1, viewMonth);
        const maxD = daysInMonth(viewYear + 1, viewMonth);
        onFocusDay(viewYear + 1, viewMonth, Math.min(focusDay.d, maxD));
      } else {
        shiftMonth(1);
      }
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      onSelectDay(focusDay.y, focusDay.m, focusDay.d);
    }
  }

  const cells: Array<{ d: number } | null> = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) cells.push({ d });
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="dtp-cal">
      <div className="dtp-cal-head">
        <button
          type="button"
          className="dtp-icon-btn"
          aria-label={t("calendar.prevMonth")}
          onClick={() => shiftMonth(-1)}
        >
          <CaretLeft size={16} />
        </button>
        <div id={labelId} className="dtp-cal-label" aria-live="polite">
          {monthLabel}
        </div>
        <button
          type="button"
          className="dtp-icon-btn"
          aria-label={t("calendar.nextMonth")}
          onClick={() => shiftMonth(1)}
        >
          <CaretRight size={16} />
        </button>
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={labelId}
        className="dtp-grid"
        onKeyDown={onGridKey}
      >
        <div role="row" className="dtp-dow">
          {dowHeaders.map((d) => (
            <div
              key={d.long}
              role="columnheader"
              aria-label={d.long}
              title={d.long}
              className="label-caps"
            >
              {d.short}
            </div>
          ))}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <div key={row} role="row" className="dtp-week">
            {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
              if (!cell) {
                return (
                  <div
                    key={`e-${row}-${col}`}
                    role="gridcell"
                    className="dtp-day empty"
                  />
                );
              }
              const isSelected =
                selected?.y === viewYear &&
                selected?.m === viewMonth &&
                selected?.d === cell.d;
              const isToday =
                today.y === viewYear &&
                today.m === viewMonth &&
                today.d === cell.d;
              const isFocus =
                focusDay.y === viewYear &&
                focusDay.m === viewMonth &&
                focusDay.d === cell.d;
              const cellDate = fromActiveWall({
                y: viewYear,
                m: viewMonth,
                d: cell.d,
                hh: 12,
                mm: 0,
              });
              const past =
                startOfActiveDay(cellDate).getTime() <
                startOfActiveDay(now).getTime();
              const aria =
                dayAriaFmt.format(cellDate) +
                (past ? t("picker.pastDay") : "");
              return (
                <div key={cell.d} role="gridcell" className="dtp-day-cell">
                  <button
                    type="button"
                    tabIndex={isFocus ? 0 : -1}
                    className={[
                      "dtp-day",
                      isSelected ? "selected" : "",
                      isToday ? "today" : "",
                      past ? "past" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={aria}
                    aria-selected={isSelected || undefined}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => onSelectDay(viewYear, viewMonth, cell.d)}
                    onFocus={() => onFocusDay(viewYear, viewMonth, cell.d)}
                  >
                    {cell.d}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
