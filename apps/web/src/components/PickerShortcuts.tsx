import { formatParsePreview } from "../lib/date_parse";
import {
  addParisDays,
  dateOnlyParisIso,
  fromParisWall,
  isDateOnly,
  type ParisWall,
  parisWeekday,
  startOfParisDay,
  toParisParts,
} from "../lib/paris_time";

export type ShortcutKind = "due" | "reminder";

export type Shortcut = {
  id: string;
  label: string;
  iso: string | null;
  dateOnly: boolean;
  preview: string;
};

function wallIso(wall: ParisWall, dateOnly: boolean): string {
  if (dateOnly) return dateOnlyParisIso(wall.y, wall.m, wall.d);
  return fromParisWall(wall).toISOString();
}

function roundUpQuarter(date: Date): Date {
  const ms = 15 * 60_000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

function roundDownQuarter(date: Date): Date {
  const ms = 15 * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

function nextSaturday(now: Date): Date {
  let d = addParisDays(startOfParisDay(now), 1);
  for (let i = 0; i < 8; i += 1) {
    if (parisWeekday(d) === 6) return d;
    d = addParisDays(d, 1);
  }
  return d;
}

function nextMonday(now: Date): Date {
  let d = addParisDays(startOfParisDay(now), 1);
  for (let i = 0; i < 8; i += 1) {
    if (parisWeekday(d) === 1) return d;
    d = addParisDays(d, 1);
  }
  return d;
}

export function buildShortcuts(args: {
  kind: ShortcutKind;
  now: Date;
  value: string | null;
  relatedDueAt?: string | null;
}): Shortcut[] {
  const { kind, now, value, relatedDueAt } = args;
  const p = toParisParts(now);
  const out: Shortcut[] = [];

  function push(
    id: string,
    label: string,
    iso: string | null,
    dateOnly: boolean,
  ) {
    if (iso && new Date(iso).getTime() < now.getTime()) return;
    out.push({
      id,
      label,
      iso,
      dateOnly,
      preview: iso ? formatParsePreview(iso, dateOnly) : "",
    });
  }

  if (kind === "due") {
    push(
      "today",
      "Hoy",
      wallIso({ y: p.y, m: p.m, d: p.d, hh: 23, mm: 59 }, true),
      true,
    );
  }

  if (p.hh < 17 || (p.hh === 17 && p.mm < 30)) {
    push(
      "afternoon",
      "Esta tarde",
      wallIso({ y: p.y, m: p.m, d: p.d, hh: 18, mm: 0 }, false),
      false,
    );
  }

  {
    const tom = addParisDays(startOfParisDay(now), 1);
    const tp = toParisParts(tom);
    push(
      "tomorrow",
      "Mañana",
      wallIso({ y: tp.y, m: tp.m, d: tp.d, hh: 9, mm: 0 }, false),
      false,
    );
  }

  const wd = parisWeekday(now);
  if (wd >= 1 && wd <= 5) {
    const sat = nextSaturday(now);
    const sp = toParisParts(sat);
    push(
      "weekend",
      "Este fin de semana",
      wallIso({ y: sp.y, m: sp.m, d: sp.d, hh: 10, mm: 0 }, false),
      false,
    );
  }

  {
    const mon = nextMonday(now);
    const mp = toParisParts(mon);
    push(
      "nextweek",
      "Próxima semana",
      wallIso({ y: mp.y, m: mp.m, d: mp.d, hh: 9, mm: 0 }, false),
      false,
    );
  }

  if (kind === "reminder") {
    const in1h = roundUpQuarter(new Date(now.getTime() + 60 * 60_000));
    const ip = toParisParts(in1h);
    push(
      "in1h",
      "En 1 hora",
      wallIso({ y: ip.y, m: ip.m, d: ip.d, hh: ip.hh, mm: ip.mm }, false),
      false,
    );

    if (relatedDueAt && new Date(relatedDueAt).getTime() > now.getTime()) {
      let before: Date;
      if (isDateOnly(relatedDueAt)) {
        const dp = toParisParts(new Date(relatedDueAt));
        before = fromParisWall({
          y: dp.y,
          m: dp.m,
          d: dp.d,
          hh: 9,
          mm: 0,
        });
      } else {
        before = roundDownQuarter(
          new Date(new Date(relatedDueAt).getTime() - 60 * 60_000),
        );
      }
      if (before.getTime() > now.getTime()) {
        const bp = toParisParts(before);
        push(
          "before-due",
          "Antes de que venza",
          wallIso(
            { y: bp.y, m: bp.m, d: bp.d, hh: bp.hh, mm: bp.mm },
            false,
          ),
          false,
        );
      }
    }
  }

  if (value) {
    out.push({
      id: "clear",
      label: kind === "due" ? "Sin fecha" : "Sin aviso",
      iso: null,
      dateOnly: false,
      preview: "",
    });
  }

  return out;
}

type Props = {
  shortcuts: Shortcut[];
  activeIndex: number;
  onSelect: (s: Shortcut) => void;
  onActiveChange: (i: number) => void;
};

export function PickerShortcuts({
  shortcuts,
  activeIndex,
  onSelect,
  onActiveChange,
}: Props) {
  const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  return (
    <div
      className="dtp-shortcuts"
      role="listbox"
      aria-label="Atajos"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onActiveChange(Math.min(shortcuts.length - 1, activeIndex + 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onActiveChange(Math.max(0, activeIndex - 1));
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const s = shortcuts[activeIndex];
          if (s) onSelect(s);
        }
      }}
    >
      {shortcuts.map((s, i) => {
        const long =
          s.iso === null
            ? s.label
            : `${s.label}, ${formatParsePreview(s.iso, s.dateOnly).replace(" · ", ", ")}`;
        // Compact right column (v1.2 §1 anatomy): «vie 9 · 09:00», no year.
        let right = "";
        if (s.iso) {
          const pp = toParisParts(new Date(s.iso));
          const wd = DAYS[parisWeekday(new Date(s.iso))];
          const hm = `${String(pp.hh).padStart(2, "0")}:${String(pp.mm).padStart(2, "0")}`;
          if (s.id === "today") {
            right = `${wd} ${pp.d}`;
          } else if (s.id === "afternoon" || s.id === "in1h") {
            right = hm;
          } else if (s.dateOnly) {
            right = `${wd} ${pp.d}`;
          } else {
            right = `${wd} ${pp.d} · ${hm}`;
          }
        }
        return (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            aria-label={long}
            className={`dtp-shortcut${i === activeIndex ? " active" : ""}`}
            onMouseEnter={() => onActiveChange(i)}
            onClick={() => onSelect(s)}
          >
            <span className="dtp-shortcut-name">{s.label}</span>
            {right ? (
              <span className="dtp-shortcut-when mono">{right}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
