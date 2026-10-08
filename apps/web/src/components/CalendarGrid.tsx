import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import {
  addParisDays,
  fromParisWall,
  startOfParisDay,
  toParisParts,
} from "../lib/paris_time";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const DOW_SHORT = ["L", "M", "X", "J", "V", "S", "D"] as const;
const DOW_LONG = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

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
  const first = fromParisWall({ y, m, d: 1, hh: 12, mm: 0 });
  const sunBased = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
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
  const labelId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const today = toParisParts(now);
  const dim = daysInMonth(viewYear, viewMonth);
  const offset = mondayOffset(viewYear, viewMonth);

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
    const cur = fromParisWall({
      y: focusDay.y,
      m: focusDay.m,
      d: focusDay.d,
      hh: 12,
      mm: 0,
    });
    const next = addParisDays(startOfParisDay(cur), deltaDays);
    const p = toParisParts(next);
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
      const cur = fromParisWall({
        y: focusDay.y,
        m: focusDay.m,
        d: focusDay.d,
        hh: 12,
        mm: 0,
      });
      const sunBased = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Paris",
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
      const cur = fromParisWall({
        y: focusDay.y,
        m: focusDay.m,
        d: focusDay.d,
        hh: 12,
        mm: 0,
      });
      const sunBased = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Paris",
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
          aria-label="Mes anterior"
          onClick={() => shiftMonth(-1)}
        >
          <CaretLeft size={16} />
        </button>
        <div id={labelId} className="dtp-cal-label" aria-live="polite">
          {MONTHS[viewMonth - 1]} {viewYear}
        </div>
        <button
          type="button"
          className="dtp-icon-btn"
          aria-label="Mes siguiente"
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
          {DOW_SHORT.map((d, i) => (
            <div
              key={d}
              role="columnheader"
              aria-label={DOW_LONG[i]}
              title={DOW_LONG[i]}
              className="label-caps"
            >
              {d}
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
              const cellDate = fromParisWall({
                y: viewYear,
                m: viewMonth,
                d: cell.d,
                hh: 12,
                mm: 0,
              });
              const past =
                startOfParisDay(cellDate).getTime() <
                startOfParisDay(now).getTime();
              const longMonths = MONTHS;
              const aria = `${DOW_LONG[col]}, ${cell.d} de ${longMonths[viewMonth - 1]} de ${viewYear}${past ? ", ya pasó" : ""}`;
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
