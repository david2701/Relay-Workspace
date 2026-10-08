import {
  addParisDays,
  dateOnlyParisIso,
  fromParisWallDetailed,
  parisWeekday,
  startOfParisDay,
  toParisParts,
  type DstNote,
  type ParisWall,
} from "./paris_time";

export type ParseKind = "due" | "reminder";

export type ParseOk = {
  ok: true;
  iso: string;
  dateOnly: boolean;
  dst?: DstNote;
};

export type ParseFail = {
  ok: false;
  reason: "empty" | "ambiguous" | "unknown";
};

export type ParseResult = ParseOk | ParseFail;

const MONTHS_FULL = [
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

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
};

export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function wallToResult(
  wall: ParisWall,
  dateOnly: boolean,
): ParseOk {
  if (dateOnly) {
    const iso = dateOnlyParisIso(wall.y, wall.m, wall.d);
    return { ok: true, iso, dateOnly: true };
  }
  const { date, dst } = fromParisWallDetailed(wall);
  const result: ParseOk = {
    ok: true,
    iso: date.toISOString(),
    dateOnly: false,
  };
  if (dst) result.dst = dst;
  return result;
}

function nextWeekday(now: Date, targetWd: number): Date {
  // Next occurrence excluding today.
  let d = addParisDays(startOfParisDay(now), 1);
  for (let i = 0; i < 8; i += 1) {
    if (parisWeekday(d) === targetWd) return d;
    d = addParisDays(d, 1);
  }
  return d;
}

function nextSaturday(now: Date): Date {
  return nextWeekday(now, 6);
}

function nextMonday(now: Date): Date {
  return nextWeekday(now, 1);
}

function parseMonthToken(tok: string): number | null {
  const i = MONTHS_SHORT.indexOf(tok.slice(0, 3) as (typeof MONTHS_SHORT)[number]);
  if (i >= 0) return i + 1;
  const full = MONTHS_FULL.findIndex((m) => foldAccents(m) === tok || tok.startsWith(foldAccents(m).slice(0, 3)));
  if (full >= 0) return full + 1;
  return null;
}

type TimeParts = { hh: number; mm: number };

function parseTimeToken(raw: string): TimeParts | null {
  const t = foldAccents(raw.trim());
  let m = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 23 || mm > 59) return null;
    return { hh, mm };
  }
  m = t.match(/^(\d{1,2})h(\d{2})?$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = m[2] ? Number(m[2]) : 0;
    if (hh > 23 || mm > 59) return null;
    return { hh, mm };
  }
  m = t.match(/^(\d{3,4})$/);
  if (m) {
    const digits = m[1]!;
    const hh = digits.length === 3 ? Number(digits[0]) : Number(digits.slice(0, 2));
    const mm = Number(digits.slice(-2));
    if (hh > 23 || mm > 59) return null;
    return { hh, mm };
  }
  m = t.match(/^(\d{1,2})$/);
  if (m) {
    const hh = Number(m[1]);
    if (hh > 23) return null;
    return { hh, mm: 0 };
  }
  return null;
}

function defaultTime(
  kind: ParseKind,
  hasExplicitTime: boolean,
): { hh: number; mm: number; dateOnly: boolean } {
  if (hasExplicitTime) return { hh: 0, mm: 0, dateOnly: false };
  if (kind === "reminder") return { hh: 9, mm: 0, dateOnly: false };
  return { hh: 23, mm: 59, dateOnly: true };
}

function resolveNamedDay(
  folded: string,
  now: Date,
): { date: Date; consumed: string } | null {
  if (folded === "hoy") {
    return { date: startOfParisDay(now), consumed: "hoy" };
  }
  if (folded === "manana") {
    return { date: addParisDays(startOfParisDay(now), 1), consumed: "manana" };
  }
  if (folded === "pasado manana" || folded === "pasado") {
    return { date: addParisDays(startOfParisDay(now), 2), consumed: folded };
  }
  if (folded === "esta tarde") {
    const p = toParisParts(now);
    return {
      date: fromParisWallDetailed({
        y: p.y,
        m: p.m,
        d: p.d,
        hh: 18,
        mm: 0,
      }).date,
      consumed: "esta tarde",
    };
  }
  if (
    folded === "finde" ||
    folded === "fin de semana" ||
    folded === "este fin de semana"
  ) {
    const sat = nextSaturday(now);
    const sp = toParisParts(sat);
    return {
      date: fromParisWallDetailed({
        y: sp.y,
        m: sp.m,
        d: sp.d,
        hh: 10,
        mm: 0,
      }).date,
      consumed: folded,
    };
  }
  if (folded === "proxima semana" || folded === "prox semana") {
    const mon = nextMonday(now);
    const mp = toParisParts(mon);
    return {
      date: fromParisWallDetailed({
        y: mp.y,
        m: mp.m,
        d: mp.d,
        hh: 9,
        mm: 0,
      }).date,
      consumed: folded,
    };
  }
  return null;
}

/**
 * Closed-scope Spanish natural date grammar (§1.3.2).
 * Format: [day] [time], either optional, at least one required.
 */
export function parseNaturalDate(
  text: string,
  opts: { now?: Date; kind: ParseKind },
): ParseResult {
  const now = opts.now ?? new Date();
  const kind = opts.kind;
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const folded = foldAccents(trimmed).replace(/\s+/g, " ");

  if (
    folded === "sin fecha" ||
    folded === "sin aviso" ||
    folded === "ninguna" ||
    folded === "ninguno"
  ) {
    return { ok: false, reason: "empty" };
  }

  // Bare integer → ambiguous (hour or day?)
  if (/^\d{1,2}$/.test(folded)) {
    return { ok: false, reason: "ambiguous" };
  }

  // Displacement: +Nd, +Nsem, +Nh, +Nmin
  const disp = folded.match(/^\+(\d+)\s*(d|sem|h|min)$/);
  if (disp) {
    const n = Number(disp[1]);
    const unit = disp[2]!;
    if (unit === "d") {
      const day = addParisDays(startOfParisDay(now), n);
      const p = toParisParts(day);
      const def = defaultTime(kind, false);
      return wallToResult(
        { y: p.y, m: p.m, d: p.d, hh: def.hh, mm: def.mm },
        def.dateOnly,
      );
    }
    if (unit === "sem") {
      const day = addParisDays(startOfParisDay(now), n * 7);
      const p = toParisParts(day);
      const def = defaultTime(kind, false);
      return wallToResult(
        { y: p.y, m: p.m, d: p.d, hh: def.hh, mm: def.mm },
        def.dateOnly,
      );
    }
    if (unit === "h") {
      const t = new Date(now.getTime() + n * 3_600_000);
      const p = toParisParts(t);
      return wallToResult(
        { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm },
        false,
      );
    }
    if (unit === "min") {
      const t = new Date(now.getTime() + n * 60_000);
      const p = toParisParts(t);
      return wallToResult(
        { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm },
        false,
      );
    }
  }

  // Multi-word named shortcuts first
  for (const phrase of [
    "pasado manana",
    "esta tarde",
    "fin de semana",
    "este fin de semana",
    "proxima semana",
    "prox semana",
  ]) {
    if (folded === phrase || folded.startsWith(`${phrase} `)) {
      const named = resolveNamedDay(phrase, now);
      if (!named) break;
      const rest = folded.slice(phrase.length).trim();
      // Fixed-time shortcuts (esta tarde / finde / próxima semana)
      if (
        phrase === "esta tarde" ||
        phrase === "fin de semana" ||
        phrase === "este fin de semana" ||
        phrase === "proxima semana" ||
        phrase === "prox semana"
      ) {
        if (rest) {
          const tm = parseTimeFromRest(rest);
          if (!tm) return { ok: false, reason: "unknown" };
          const p = toParisParts(named.date);
          return wallToResult(
            { y: p.y, m: p.m, d: p.d, hh: tm.hh, mm: tm.mm },
            false,
          );
        }
        const p = toParisParts(named.date);
        return wallToResult(
          { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm },
          false,
        );
      }
      // pasado mañana — day only unless time follows
      return finishDay(named.date, rest, kind, now);
    }
  }

  // Single-token named days
  for (const phrase of ["hoy", "manana", "pasado", "finde"]) {
    if (folded === phrase || folded.startsWith(`${phrase} `)) {
      const named = resolveNamedDay(phrase === "finde" ? "finde" : phrase, now);
      if (!named) break;
      const rest = folded.slice(phrase.length).trim();
      if (phrase === "finde") {
        if (rest) {
          const tm = parseTimeFromRest(rest);
          if (!tm) return { ok: false, reason: "unknown" };
          const p = toParisParts(named.date);
          return wallToResult(
            { y: p.y, m: p.m, d: p.d, hh: tm.hh, mm: tm.mm },
            false,
          );
        }
        const p = toParisParts(named.date);
        return wallToResult(
          { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm },
          false,
        );
      }
      return finishDay(named.date, rest, kind, now);
    }
  }

  // Weekday names
  const wdMatch = folded.match(
    /^(domingo|dom|lunes|lun|martes|mar|miercoles|mie|jueves|jue|viernes|vie|sabado|sab)(?:\s+(.+))?$/,
  );
  if (wdMatch) {
    const wd = WEEKDAYS[wdMatch[1]!];
    if (wd === undefined) return { ok: false, reason: "unknown" };
    const day = nextWeekday(now, wd);
    return finishDay(day, wdMatch[2] ?? "", kind, now);
  }

  // Numeric / named calendar dates: 15/10, 15-10, 15/10/2026, 15 oct, 15 octubre
  const slash = folded.match(
    /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s+(.+))?$/,
  );
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : undefined;
    if (year !== undefined && year < 100) year += 2000;
    const rest = slash[4] ?? "";
    const resolved = resolveCalendarDay(day, month, year, now);
    if (!resolved) return { ok: false, reason: "unknown" };
    return finishDay(resolved, rest, kind, now);
  }

  const namedDate = folded.match(
    /^(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(\d{4}))?(?:\s+(.+))?$/,
  );
  if (namedDate) {
    const day = Number(namedDate[1]);
    const month = parseMonthToken(namedDate[2]!);
    if (!month) return { ok: false, reason: "unknown" };
    const year = namedDate[3] ? Number(namedDate[3]) : undefined;
    const rest = namedDate[4] ?? "";
    const resolved = resolveCalendarDay(day, month, year, now);
    if (!resolved) return { ok: false, reason: "unknown" };
    return finishDay(resolved, rest, kind, now);
  }

  // Time only: today, or tomorrow if already past
  const timeOnly = parseTimeFromRest(folded);
  if (timeOnly && isPureTime(folded)) {
    const p = toParisParts(now);
    let wall: ParisWall = {
      y: p.y,
      m: p.m,
      d: p.d,
      hh: timeOnly.hh,
      mm: timeOnly.mm,
    };
    let result = wallToResult(wall, false);
    if (new Date(result.iso).getTime() <= now.getTime()) {
      const tomorrow = addParisDays(startOfParisDay(now), 1);
      const tp = toParisParts(tomorrow);
      wall = {
        y: tp.y,
        m: tp.m,
        d: tp.d,
        hh: timeOnly.hh,
        mm: timeOnly.mm,
      };
      result = wallToResult(wall, false);
    }
    return result;
  }

  return { ok: false, reason: "unknown" };
}

function isPureTime(folded: string): boolean {
  return /^(?:a las\s+)?\d{1,2}(?:[:.h]\d{0,2}|h)?$/.test(folded);
}

function parseTimeFromRest(rest: string): TimeParts | null {
  const r = rest.trim();
  if (!r) return null;
  const folded = foldAccents(r);
  const stripped = folded.replace(/^a las\s+/, "");
  return parseTimeToken(stripped);
}

function finishDay(
  day: Date,
  rest: string,
  kind: ParseKind,
  _now: Date,
): ParseResult {
  const p = toParisParts(day);
  const tm = rest.trim() ? parseTimeFromRest(rest) : null;
  if (rest.trim() && !tm) return { ok: false, reason: "unknown" };
  if (tm) {
    return wallToResult(
      { y: p.y, m: p.m, d: p.d, hh: tm.hh, mm: tm.mm },
      false,
    );
  }
  const def = defaultTime(kind, false);
  return wallToResult(
    { y: p.y, m: p.m, d: p.d, hh: def.hh, mm: def.mm },
    def.dateOnly,
  );
}

function resolveCalendarDay(
  day: number,
  month: number,
  year: number | undefined,
  now: Date,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const np = toParisParts(now);
  if (year !== undefined) {
    return startOfParisDay(
      fromParisWallDetailed({ y: year, m: month, d: day, hh: 12, mm: 0 }).date,
    );
  }
  // Next future occurrence (including today if still that day)
  let y = np.y;
  let candidate = startOfParisDay(
    fromParisWallDetailed({ y, m: month, d: day, hh: 12, mm: 0 }).date,
  );
  if (candidate.getTime() < startOfParisDay(now).getTime()) {
    y += 1;
    candidate = startOfParisDay(
      fromParisWallDetailed({ y, m: month, d: day, hh: 12, mm: 0 }).date,
    );
  }
  return candidate;
}

/** Format a parse result for the live preview line. */
export function formatParsePreview(iso: string, dateOnly: boolean): string {
  const p = toParisParts(new Date(iso));
  const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
  const MONTHS = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ] as const;
  const wd = parisWeekday(new Date(iso));
  const datePart = `${DAYS[wd]} ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
  if (dateOnly || (p.hh === 23 && p.mm === 59)) return datePart;
  return `${datePart} · ${pad(p.hh)}:${pad(p.mm)}`;
}

export function dstMessage(dst: DstNote): string {
  const MONTHS = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ] as const;
  const w = dst.wall;
  if (dst.kind === "gap") {
    return `Esa hora no existe el ${w.d} ${MONTHS[w.m - 1]} (cambio de hora). Se guarda a las ${pad(w.hh)}:${pad(w.mm)}.`;
  }
  return `Esa hora se repite el ${w.d} ${MONTHS[w.m - 1]}. Se usa la primera (${pad(w.hh)}:${pad(w.mm)} CEST).`;
}
