/**
 * Calendar / day-boundary math in an arbitrary IANA timezone.
 * Replaces hardcoded Europe/Paris helpers.
 */

export type ZoneWall = {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
};

export type DstNote = {
  kind: "gap" | "overlap";
  wall: ZoneWall;
};

export type FromZoneWallResult = {
  date: Date;
  dst?: DstNote;
};

const partsCache = new Map<string, Intl.DateTimeFormat>();
const weekdayCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

function weekdayFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = weekdayCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    });
    weekdayCache.set(timeZone, f);
  }
  return f;
}

function partNumber(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const raw = parts.find((p) => p.type === type)?.value;
  return Number(raw);
}

/** Calendar + clock parts of an instant in `timeZone`. */
export function toZoneParts(
  date: Date,
  timeZone: string,
): ZoneWall & { ss: number } {
  const parts = partsFormatter(timeZone).formatToParts(date);
  return {
    y: partNumber(parts, "year"),
    m: partNumber(parts, "month"),
    d: partNumber(parts, "day"),
    hh: partNumber(parts, "hour"),
    mm: partNumber(parts, "minute"),
    ss: partNumber(parts, "second"),
  };
}

function wallMatches(parts: ZoneWall, wall: ZoneWall): boolean {
  return (
    parts.y === wall.y &&
    parts.m === wall.m &&
    parts.d === wall.d &&
    parts.hh === wall.hh &&
    parts.mm === wall.mm
  );
}

function advanceWallOneHour(wall: ZoneWall): ZoneWall {
  let { y, m, d, hh, mm } = wall;
  hh += 1;
  if (hh < 24) return { y, m, d, hh, mm };
  hh = 0;
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return {
    y: next.getUTCFullYear(),
    m: next.getUTCMonth() + 1,
    d: next.getUTCDate(),
    hh,
    mm,
  };
}

/**
 * Offset (ms) of `timeZone` at `utcMs`: zoneLocal − UTC.
 * Positive for zones east of UTC.
 */
function offsetAt(utcMs: number, timeZone: string): number {
  const p = toZoneParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - utcMs;
}

/**
 * Convert a wall clock time in `timeZone` to a UTC Date.
 * DST gap: advance by one hour. DST overlap: first occurrence.
 */
export function fromZoneWall(wall: ZoneWall, timeZone: string): Date {
  return fromZoneWallDetailed(wall, timeZone).date;
}

export function fromZoneWallDetailed(
  wall: ZoneWall,
  timeZone: string,
): FromZoneWallResult {
  // Guess: treat wall as UTC, then correct by the zone offset at that guess.
  const utcGuess = Date.UTC(wall.y, wall.m - 1, wall.d, wall.hh, wall.mm, 0);
  const off1 = offsetAt(utcGuess, timeZone);
  let candidate = utcGuess - off1;
  const off2 = offsetAt(candidate, timeZone);
  if (off2 !== off1) {
    candidate = utcGuess - off2;
  }

  const matches: number[] = [];
  // Probe ± a few hours around the candidate for overlap (two UTC instants).
  for (const delta of [-3, -2, -1, 0, 1, 2, 3].map((h) => h * 3_600_000)) {
    const utc = candidate + delta;
    if (wallMatches(toZoneParts(new Date(utc), timeZone), wall)) {
      if (!matches.includes(utc)) matches.push(utc);
    }
  }

  if (matches.length > 0) {
    const first = Math.min(...matches);
    const result: FromZoneWallResult = { date: new Date(first) };
    if (matches.length > 1) {
      result.dst = { kind: "overlap", wall };
    }
    return result;
  }

  // Gap: wall does not exist — advance one hour (spring-forward style).
  const advanced = advanceWallOneHour(wall);
  const resolved = fromZoneWallDetailed(advanced, timeZone);
  return {
    date: resolved.date,
    dst: { kind: "gap", wall: advanced },
  };
}

export function startOfZoneDay(date: Date, timeZone: string): Date {
  const p = toZoneParts(date, timeZone);
  return fromZoneWall({ y: p.y, m: p.m, d: p.d, hh: 0, mm: 0 }, timeZone);
}

export function endOfZoneDay(date: Date, timeZone: string): Date {
  const startNext = addZoneDays(startOfZoneDay(date, timeZone), 1, timeZone);
  return new Date(startNext.getTime() - 1);
}

/** Add calendar days in `timeZone`, preserving wall clock time. */
export function addZoneDays(
  date: Date,
  days: number,
  timeZone: string,
): Date {
  const p = toZoneParts(date, timeZone);
  const noon = fromZoneWall({ y: p.y, m: p.m, d: p.d, hh: 12, mm: 0 }, timeZone);
  const shifted = new Date(noon.getTime() + days * 86_400_000);
  const sp = toZoneParts(shifted, timeZone);
  return fromZoneWall(
    { y: sp.y, m: sp.m, d: sp.d, hh: p.hh, mm: p.mm },
    timeZone,
  );
}

/** True when the zone wall clock is exactly 23:59 (date-only convention). */
export function isDateOnlyInZone(iso: string, timeZone: string): boolean {
  const p = toZoneParts(new Date(iso), timeZone);
  return p.hh === 23 && p.mm === 59;
}

/** 23:59 in `timeZone` on that calendar day, as UTC ISO. */
export function dateOnlyZoneIso(
  y: number,
  m: number,
  d: number,
  timeZone: string,
): string {
  return fromZoneWall({ y, m, d, hh: 23, mm: 59 }, timeZone).toISOString();
}

/** Sunday=0 … Saturday=6 in `timeZone`. */
export function zoneWeekday(date: Date, timeZone: string): number {
  const short = weekdayFormatter(timeZone).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[short] ?? 0;
}

/** Monday 00:00 of the week containing `date` in `timeZone` (week starts Monday). */
export function startOfZoneWeek(date: Date, timeZone: string): Date {
  const start = startOfZoneDay(date, timeZone);
  const wd = zoneWeekday(start, timeZone);
  const daysFromMonday = wd === 0 ? 6 : wd - 1;
  return addZoneDays(start, -daysFromMonday, timeZone);
}

/** Sunday 23:59:59.999 of the week containing `date`. */
export function endOfZoneWeek(date: Date, timeZone: string): Date {
  const monday = startOfZoneWeek(date, timeZone);
  const nextMonday = addZoneDays(monday, 7, timeZone);
  return new Date(nextMonday.getTime() - 1);
}

/** Whole calendar-day distance in `timeZone` (due − now). */
export function zoneDayDiff(
  isoOrDate: string | Date,
  timeZone: string,
  now = new Date(),
): number {
  const that = startOfZoneDay(
    typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate,
    timeZone,
  );
  const today = startOfZoneDay(now, timeZone);
  return Math.round((that.getTime() - today.getTime()) / 86_400_000);
}

/** Default when settings are missing (browser / install default applied later). */
export const DEFAULT_TIMEZONE = "UTC";
