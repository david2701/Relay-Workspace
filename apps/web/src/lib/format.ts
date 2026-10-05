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

const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

/** Display timezone for absolute dates (specs: es-ES, Europe/Paris). */
export const DISPLAY_TZ = "Europe/Paris";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function partsInTz(
  iso: string,
  timeZone: string = DISPLAY_TZ,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const map = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday ?? "Mon"] ?? 1,
  };
}

function startOfDayParis(isoOrNow: Date): Date {
  const p = partsInTz(isoOrNow.toISOString());
  // Reconstruct UTC instant for midnight Paris on that calendar day via formatter inverse approx
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
  const mid = partsInTz(guess.toISOString());
  const asUtc = Date.UTC(mid.year, mid.month - 1, mid.day, 0, 0, 0);
  // Adjust by Paris offset at that moment
  const probe = new Date(asUtc);
  const pp = partsInTz(probe.toISOString());
  const localAsUtc = Date.UTC(pp.year, pp.month - 1, pp.day, pp.hour, pp.minute);
  const offset = localAsUtc - probe.getTime();
  return new Date(asUtc - offset);
}

export function formatRelative(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const p = partsInTz(iso);
  const hm = `${pad(p.hour)}:${pad(p.minute)}`;
  const today = startOfDayParis(now);
  const that = startOfDayParis(d);
  const dayDiff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (dayDiff === 1) return `ayer ${hm}`;
  if (dayDiff < 7) return `${DAYS[p.weekday]} ${hm}`;
  if (p.year === partsInTz(now.toISOString()).year) {
    return `${p.day} ${MONTHS[p.month - 1]}`;
  }
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

export function formatDue(iso: string, now = new Date()): {
  text: string;
  tone: "muted" | "warn" | "crit";
} {
  const d = new Date(iso);
  const p = partsInTz(iso);
  const hm = `${pad(p.hour)}:${pad(p.minute)}`;
  const today = startOfDayParis(now);
  const that = startOfDayParis(d);
  const dayDiff = Math.round((that.getTime() - today.getTime()) / 86_400_000);
  if (d.getTime() < now.getTime()) {
    if (dayDiff === 0) return { text: `Venció hoy a las ${hm}`, tone: "crit" };
    if (dayDiff === -1) return { text: "Venció ayer", tone: "crit" };
    return {
      text: `Venció el ${p.day} ${MONTHS[p.month - 1]}`,
      tone: "crit",
    };
  }
  if (dayDiff === 0) {
    const hoursLeft = (d.getTime() - now.getTime()) / 3_600_000;
    return {
      text: `Hoy ${hm}`,
      tone: hoursLeft < 4 ? "warn" : "muted",
    };
  }
  if (dayDiff === 1) return { text: `Mañana ${hm}`, tone: "muted" };
  if (dayDiff < 7) {
    return { text: `${DAYS[p.weekday]} ${hm}`, tone: "muted" };
  }
  return {
    text: `${p.day} ${MONTHS[p.month - 1]} ${hm}`,
    tone: "muted",
  };
}

/** Absolute display: «6 oct, 09:23» (Europe/Paris, 24 h). */
export function formatAbsolute(iso: string): string {
  const p = partsInTz(iso);
  return `${p.day} ${MONTHS[p.month - 1]}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Longer absolute for form fields: «6 oct 2026, 09:23». */
export function formatDateTimeField(iso: string): string {
  const p = partsInTz(iso);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Parse «d mon yyyy, HH:mm» or «dd/mm/yyyy HH:mm» in Europe/Paris wall time → ISO. */
export function parseDateTimeField(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const slash = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/,
  );
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    const hour = Number(slash[4] ?? "0");
    const minute = Number(slash[5] ?? "0");
    return wallParisToIso(year, month, day, hour, minute);
  }
  const named = trimmed.match(
    /^(\d{1,2})\s+([a-záéíóú]{3})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})$/i,
  );
  if (named) {
    const mon = named[2]?.toLowerCase() ?? "";
    const month = MONTHS.indexOf(mon as (typeof MONTHS)[number]) + 1;
    if (month < 1) return null;
    return wallParisToIso(
      Number(named[3]),
      month,
      Number(named[1]),
      Number(named[4]),
      Number(named[5]),
    );
  }
  return null;
}

function wallParisToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  // Binary search UTC instant whose Paris wall clock matches.
  let lo = Date.UTC(year, month - 1, day - 1, 0, 0, 0);
  let hi = Date.UTC(year, month - 1, day + 1, 23, 59, 59);
  for (let i = 0; i < 40; i += 1) {
    const mid = Math.floor((lo + hi) / 2);
    const p = partsInTz(new Date(mid).toISOString());
    const cmp =
      p.year - year ||
      p.month - month ||
      p.day - day ||
      p.hour - hour ||
      p.minute - minute;
    if (cmp === 0) return new Date(mid).toISOString();
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return new Date(Date.UTC(year, month - 1, day, hour - 1, minute)).toISOString();
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const p = partsInTz(iso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const p = partsInTz(iso);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function fromDateAndTime(date: string, time: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  return wallParisToIso(y, m, d, hh ?? 0, mm ?? 0);
}

export function hoursSince(iso: string, now = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}
