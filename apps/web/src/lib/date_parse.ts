import type { LocaleCode } from "../i18n/types";
import { translate } from "../i18n/translate";
import { getDisplayContext } from "./display_context";
import {
  ALL_EMPTY_PHRASES,
  MULTI_WORD_PHRASES,
  SINGLE_DAY_PHRASES,
  WEEKDAYS,
} from "./date_parse_phrases";
import {
  addZoneDays,
  dateOnlyZoneIso,
  fromZoneWallDetailed,
  startOfZoneDay,
  toZoneParts,
  type DstNote,
  type ZoneWall,
  zoneWeekday,
} from "./zone_time";

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

export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function wallToResult(
  wall: ZoneWall,
  dateOnly: boolean,
  timeZone: string,
): ParseOk {
  if (dateOnly) {
    const iso = dateOnlyZoneIso(wall.y, wall.m, wall.d, timeZone);
    return { ok: true, iso, dateOnly: true };
  }
  const { date, dst } = fromZoneWallDetailed(wall, timeZone);
  const result: ParseOk = {
    ok: true,
    iso: date.toISOString(),
    dateOnly: false,
  };
  if (dst) result.dst = dst;
  return result;
}

function nextWeekday(now: Date, targetWd: number, timeZone: string): Date {
  let d = addZoneDays(startOfZoneDay(now, timeZone), 1, timeZone);
  for (let i = 0; i < 8; i += 1) {
    if (zoneWeekday(d, timeZone) === targetWd) return d;
    d = addZoneDays(d, 1, timeZone);
  }
  return d;
}

function nextSaturday(now: Date, timeZone: string): Date {
  return nextWeekday(now, 6, timeZone);
}

function nextMonday(now: Date, timeZone: string): Date {
  return nextWeekday(now, 1, timeZone);
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
  timeZone: string,
): { date: Date; consumed: string } | null {
  const today = () => startOfZoneDay(now, timeZone);
  if (
    folded === "hoy" ||
    folded === "today" ||
    folded === "aujourd hui" ||
    folded === "aujourdhui"
  ) {
    return { date: today(), consumed: folded };
  }
  if (folded === "manana" || folded === "tomorrow" || folded === "demain") {
    return {
      date: addZoneDays(today(), 1, timeZone),
      consumed: folded,
    };
  }
  if (
    folded === "pasado manana" ||
    folded === "pasado" ||
    folded === "day after tomorrow" ||
    folded === "apres demain"
  ) {
    return {
      date: addZoneDays(today(), 2, timeZone),
      consumed: folded,
    };
  }
  if (
    folded === "esta tarde" ||
    folded === "this afternoon" ||
    folded === "cet apres midi"
  ) {
    const p = toZoneParts(now, timeZone);
    return {
      date: fromZoneWallDetailed(
        { y: p.y, m: p.m, d: p.d, hh: 18, mm: 0 },
        timeZone,
      ).date,
      consumed: folded,
    };
  }
  if (
    folded === "finde" ||
    folded === "fin de semana" ||
    folded === "este fin de semana" ||
    folded === "weekend" ||
    folded === "week end" ||
    folded === "this weekend" ||
    folded === "ce week end" ||
    folded === "ce weekend"
  ) {
    const sat = nextSaturday(now, timeZone);
    const sp = toZoneParts(sat, timeZone);
    return {
      date: fromZoneWallDetailed(
        { y: sp.y, m: sp.m, d: sp.d, hh: 10, mm: 0 },
        timeZone,
      ).date,
      consumed: folded,
    };
  }
  if (
    folded === "proxima semana" ||
    folded === "prox semana" ||
    folded === "next week" ||
    folded === "semaine prochaine"
  ) {
    const mon = nextMonday(now, timeZone);
    const mp = toZoneParts(mon, timeZone);
    return {
      date: fromZoneWallDetailed(
        { y: mp.y, m: mp.m, d: mp.d, hh: 9, mm: 0 },
        timeZone,
      ).date,
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
  opts: {
    now?: Date;
    kind: ParseKind;
    locale?: LocaleCode;
    timezone?: string;
  },
): ParseResult {
  const now = opts.now ?? new Date();
  const kind = opts.kind;
  const timeZone = opts.timezone ?? getDisplayContext().timezone;
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const folded = foldAccents(trimmed)
    .replace(/['’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (ALL_EMPTY_PHRASES.some((p) => folded === foldAccents(p).replace(/'/g, " "))) {
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
      const day = addZoneDays(startOfZoneDay(now, timeZone), n, timeZone);
      const p = toZoneParts(day, timeZone);
      const def = defaultTime(kind, false);
      return wallToResult(
        { y: p.y, m: p.m, d: p.d, hh: def.hh, mm: def.mm },
        def.dateOnly,
        timeZone,
      );
    }
    if (unit === "sem") {
      const day = addZoneDays(startOfZoneDay(now, timeZone), n * 7, timeZone);
      const p = toZoneParts(day, timeZone);
      const def = defaultTime(kind, false);
      return wallToResult(
        { y: p.y, m: p.m, d: p.d, hh: def.hh, mm: def.mm },
        def.dateOnly,
        timeZone,
      );
    }
    if (unit === "h") {
      const t = new Date(now.getTime() + n * 3_600_000);
      const p = toZoneParts(t, timeZone);
      return wallToResult(
        { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm },
        false,
        timeZone,
      );
    }
    if (unit === "min") {
      const t = new Date(now.getTime() + n * 60_000);
      const p = toZoneParts(t, timeZone);
      return wallToResult(
        { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm },
        false,
        timeZone,
      );
    }
  }

  // Multi-word named shortcuts first
  for (const phrase of MULTI_WORD_PHRASES) {
    if (folded === phrase || folded.startsWith(`${phrase} `)) {
      const named = resolveNamedDay(phrase, now, timeZone);
      if (!named) break;
      const rest = folded.slice(phrase.length).trim();
      // Fixed-time shortcuts (esta tarde / finde / próxima semana)
      if (
        phrase.includes("tarde") ||
        phrase.includes("afternoon") ||
        phrase.includes("apres midi") ||
        phrase.includes("semana") ||
        phrase.includes("week") ||
        phrase.includes("fin de semana") ||
        phrase.includes("weekend") ||
        phrase.includes("week end")
      ) {
        if (rest) {
          const tm = parseTimeFromRest(rest);
          if (!tm) return { ok: false, reason: "unknown" };
          const p = toZoneParts(named.date, timeZone);
          return wallToResult(
            { y: p.y, m: p.m, d: p.d, hh: tm.hh, mm: tm.mm },
            false,
            timeZone,
          );
        }
        const p = toZoneParts(named.date, timeZone);
        return wallToResult(
          { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm },
          false,
          timeZone,
        );
      }
      return finishDay(named.date, rest, kind, timeZone);
    }
  }

  for (const phrase of SINGLE_DAY_PHRASES) {
    if (folded === phrase || folded.startsWith(`${phrase} `)) {
      const named = resolveNamedDay(phrase, now, timeZone);
      if (!named) break;
      const rest = folded.slice(phrase.length).trim();
      if (phrase === "finde") {
        if (rest) {
          const tm = parseTimeFromRest(rest);
          if (!tm) return { ok: false, reason: "unknown" };
          const p = toZoneParts(named.date, timeZone);
          return wallToResult(
            { y: p.y, m: p.m, d: p.d, hh: tm.hh, mm: tm.mm },
            false,
            timeZone,
          );
        }
        const p = toZoneParts(named.date, timeZone);
        return wallToResult(
          { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm },
          false,
          timeZone,
        );
      }
      return finishDay(named.date, rest, kind, timeZone);
    }
  }

  const wdKeys = Object.keys(WEEKDAYS).join("|");
  const wdMatch = folded.match(
    new RegExp(`^(${wdKeys})(?:\\s+(.+))?$`),
  );
  if (wdMatch) {
    const wd = WEEKDAYS[wdMatch[1]!];
    if (wd === undefined) return { ok: false, reason: "unknown" };
    const day = nextWeekday(now, wd, timeZone);
    return finishDay(day, wdMatch[2] ?? "", kind, timeZone);
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
    const resolved = resolveCalendarDay(day, month, year, now, timeZone);
    if (!resolved) return { ok: false, reason: "unknown" };
    return finishDay(resolved, rest, kind, timeZone);
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
    const resolved = resolveCalendarDay(day, month, year, now, timeZone);
    if (!resolved) return { ok: false, reason: "unknown" };
    return finishDay(resolved, rest, kind, timeZone);
  }

  const timeOnly = parseTimeFromRest(folded);
  if (timeOnly && isPureTime(folded)) {
    const p = toZoneParts(now, timeZone);
    let wall: ZoneWall = {
      y: p.y,
      m: p.m,
      d: p.d,
      hh: timeOnly.hh,
      mm: timeOnly.mm,
    };
    let result = wallToResult(wall, false, timeZone);
    if (new Date(result.iso).getTime() <= now.getTime()) {
      const tomorrow = addZoneDays(startOfZoneDay(now, timeZone), 1, timeZone);
      const tp = toZoneParts(tomorrow, timeZone);
      wall = {
        y: tp.y,
        m: tp.m,
        d: tp.d,
        hh: timeOnly.hh,
        mm: timeOnly.mm,
      };
      result = wallToResult(wall, false, timeZone);
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
  timeZone: string,
): ParseResult {
  const p = toZoneParts(day, timeZone);
  const tm = rest.trim() ? parseTimeFromRest(rest) : null;
  if (rest.trim() && !tm) return { ok: false, reason: "unknown" };
  if (tm) {
    return wallToResult(
      { y: p.y, m: p.m, d: p.d, hh: tm.hh, mm: tm.mm },
      false,
      timeZone,
    );
  }
  const def = defaultTime(kind, false);
  return wallToResult(
    { y: p.y, m: p.m, d: p.d, hh: def.hh, mm: def.mm },
    def.dateOnly,
    timeZone,
  );
}

function resolveCalendarDay(
  day: number,
  month: number,
  year: number | undefined,
  now: Date,
  timeZone: string,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const np = toZoneParts(now, timeZone);
  if (year !== undefined) {
    return startOfZoneDay(
      fromZoneWallDetailed(
        { y: year, m: month, d: day, hh: 12, mm: 0 },
        timeZone,
      ).date,
      timeZone,
    );
  }
  let y = np.y;
  let candidate = startOfZoneDay(
    fromZoneWallDetailed({ y, m: month, d: day, hh: 12, mm: 0 }, timeZone).date,
    timeZone,
  );
  if (candidate.getTime() < startOfZoneDay(now, timeZone).getTime()) {
    y += 1;
    candidate = startOfZoneDay(
      fromZoneWallDetailed({ y, m: month, d: day, hh: 12, mm: 0 }, timeZone)
        .date,
      timeZone,
    );
  }
  return candidate;
}

/** Format a parse result for the live preview line. */
export function formatParsePreview(iso: string, dateOnly: boolean): string {
  const ctx = getDisplayContext();
  const d = new Date(iso);
  const datePart = new Intl.DateTimeFormat(ctx.intlLocale, {
    timeZone: ctx.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
  const p = toZoneParts(d, ctx.timezone);
  if (dateOnly || (p.hh === 23 && p.mm === 59)) return datePart;
  const hm = new Intl.DateTimeFormat(ctx.intlLocale, {
    timeZone: ctx.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${datePart} · ${hm}`;
}

export function dstMessage(dst: DstNote): string {
  const ctx = getDisplayContext();
  const w = dst.wall;
  const month = new Intl.DateTimeFormat(ctx.intlLocale, { month: "short" }).format(
    new Date(Date.UTC(w.y, w.m - 1, w.d)),
  );
  const hm = `${pad(w.hh)}:${pad(w.mm)}`;
  if (dst.kind === "gap") {
    return translate(ctx.locale, "picker.dstGap", {
      day: w.d,
      month,
      time: hm,
    });
  }
  return translate(ctx.locale, "picker.dstOverlap", {
    day: w.d,
    month,
    time: hm,
  });
}

