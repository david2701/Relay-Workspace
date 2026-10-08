export const PARIS_TZ = "Europe/Paris";

export type ParisWall = {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
};

const parisPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const parisWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PARIS_TZ,
  weekday: "short",
});

function partNumber(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const raw = parts.find((p) => p.type === type)?.value;
  return Number(raw);
}

/** Calendar + clock parts of an instant in Europe/Paris. */
export function toParisParts(date: Date): ParisWall & { ss: number } {
  const parts = parisPartsFormatter.formatToParts(date);
  return {
    y: partNumber(parts, "year"),
    m: partNumber(parts, "month"),
    d: partNumber(parts, "day"),
    hh: partNumber(parts, "hour"),
    mm: partNumber(parts, "minute"),
    ss: partNumber(parts, "second"),
  };
}

function wallMatches(parts: ParisWall, wall: ParisWall): boolean {
  return (
    parts.y === wall.y &&
    parts.m === wall.m &&
    parts.d === wall.d &&
    parts.hh === wall.hh &&
    parts.mm === wall.mm
  );
}

/**
 * Convert a Paris wall clock time to a UTC Date.
 * DST gap (spring): advance by the gap (02:30 → 03:30).
 * DST overlap (fall): take the first occurrence (CEST).
 */
export function fromParisWall(wall: ParisWall): Date {
  const base = Date.UTC(wall.y, wall.m - 1, wall.d, wall.hh, wall.mm, 0);
  // Europe/Paris offsets are UTC+1 (CET) or UTC+2 (CEST).
  const candidates = [base - 2 * 3_600_000, base - 1 * 3_600_000];
  const matches: number[] = [];
  for (const utc of candidates) {
    if (wallMatches(toParisParts(new Date(utc)), wall)) {
      matches.push(utc);
    }
  }
  if (matches.length > 0) {
    return new Date(Math.min(...matches));
  }
  // Gap: wall time does not exist — advance by one hour (EU spring gap).
  const advanced = advanceWallOneHour(wall);
  return fromParisWall(advanced);
}

function advanceWallOneHour(wall: ParisWall): ParisWall {
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

export function startOfParisDay(date: Date): Date {
  const p = toParisParts(date);
  return fromParisWall({ y: p.y, m: p.m, d: p.d, hh: 0, mm: 0 });
}

export function endOfParisDay(date: Date): Date {
  const p = toParisParts(date);
  const startNext = addParisDays(startOfParisDay(date), 1);
  return new Date(startNext.getTime() - 1);
}

/** Add calendar days in Europe/Paris, preserving wall clock time. */
export function addParisDays(date: Date, days: number): Date {
  const p = toParisParts(date);
  const noon = fromParisWall({ y: p.y, m: p.m, d: p.d, hh: 12, mm: 0 });
  const shifted = new Date(noon.getTime() + days * 86_400_000);
  const sp = toParisParts(shifted);
  return fromParisWall({ y: sp.y, m: sp.m, d: sp.d, hh: p.hh, mm: p.mm });
}

/** True when the Paris wall clock is exactly 23:59 (date-only convention). */
export function isDateOnlyParis(iso: string): boolean {
  const p = toParisParts(new Date(iso));
  return p.hh === 23 && p.mm === 59;
}

/** 23:59 Europe/Paris on that calendar day, as UTC ISO. */
export function dateOnlyParisIso(y: number, m: number, d: number): string {
  return fromParisWall({ y, m, d, hh: 23, mm: 59 }).toISOString();
}

/** Sunday=0 … Saturday=6 in Europe/Paris. */
export function parisWeekday(date: Date): number {
  const short = parisWeekdayFormatter.format(date);
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
