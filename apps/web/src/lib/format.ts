import {
  addParisDays,
  fromParisWall,
  isDateOnly,
  parisDayDiff,
  parisWeekday,
  startOfParisDay,
  toParisParts,
} from "./paris_time";

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

function partsInTz(iso: string) {
  return toParisParts(new Date(iso));
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
  const hm = `${pad(p.hh)}:${pad(p.mm)}`;
  const today = startOfParisDay(now);
  const that = startOfParisDay(d);
  const dayDiff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (dayDiff === 1) return `ayer ${hm}`;
  if (dayDiff < 7) return `${DAYS[parisWeekday(d)]} ${hm}`;
  if (p.y === toParisParts(now).y) {
    return `${p.d} ${MONTHS[p.m - 1]}`;
  }
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

function pastAgo(iso: string, now: Date, verb: "Venció" | "Avisó"): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return `${verb} hace un momento`;
  if (mins < 60) return `${verb} hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${verb} hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${verb} hace ${days} d`;
  const p = partsInTz(iso);
  return `${verb} el ${p.d} ${MONTHS[p.m - 1]}`;
}

export function formatDue(
  iso: string,
  now = new Date(),
): {
  text: string;
  tone: "muted" | "warn" | "crit";
} {
  const d = new Date(iso);
  const p = partsInTz(iso);
  const dateOnly = isDateOnly(iso);
  const hm = `${pad(p.hh)}:${pad(p.mm)}`;
  const dayDiff = parisDayDiff(iso, now);

  if (d.getTime() < now.getTime()) {
    return { text: pastAgo(iso, now, "Venció"), tone: "crit" };
  }
  if (dayDiff === 0) {
    const hoursLeft = (d.getTime() - now.getTime()) / 3_600_000;
    return {
      text: dateOnly ? "Hoy" : `Hoy ${hm}`,
      tone: hoursLeft < 4 && !dateOnly ? "warn" : "muted",
    };
  }
  if (dayDiff === 1) {
    return { text: dateOnly ? "Mañana" : `Mañana ${hm}`, tone: "muted" };
  }
  if (dayDiff < 7) {
    const wd = DAYS[parisWeekday(d)];
    return {
      text: dateOnly ? `${wd}` : `${wd} ${hm}`,
      tone: "muted",
    };
  }
  return {
    text: dateOnly
      ? `${p.d} ${MONTHS[p.m - 1]}`
      : `${p.d} ${MONTHS[p.m - 1]} ${hm}`,
    tone: "muted",
  };
}

/** Compact due text depending on date group (§1.8). */
export function formatDueForGroup(
  iso: string,
  groupKey: string,
  now = new Date(),
): { text: string; tone: "muted" | "warn" | "crit" } {
  const p = partsInTz(iso);
  const dateOnly = isDateOnly(iso);
  const hm = `${pad(p.hh)}:${pad(p.mm)}`;
  const d = new Date(iso);

  if (groupKey === "overdue") {
    return { text: pastAgo(iso, now, "Venció"), tone: "crit" };
  }
  if (groupKey === "today" || groupKey === "tomorrow") {
    return { text: dateOnly ? "" : hm, tone: "muted" };
  }
  if (groupKey === "week") {
    const wd = DAYS[parisWeekday(d)];
    return {
      text: dateOnly ? `${wd}` : `${wd} ${hm}`,
      tone: "muted",
    };
  }
  if (groupKey === "later") {
    return { text: `${p.d} ${MONTHS[p.m - 1]}`, tone: "muted" };
  }
  return formatDue(iso, now);
}

/** Reminder chip: past → «Avisó hace…», never «Venció…». */
export function formatReminder(
  iso: string,
  now = new Date(),
): { text: string; tone: "muted" | "warn" | "crit" } {
  const d = new Date(iso);
  if (d.getTime() < now.getTime()) {
    return { text: pastAgo(iso, now, "Avisó"), tone: "muted" };
  }
  const due = formatDue(iso, now);
  return {
    text: due.text.replace(/^Hoy /, "").replace(/^Mañana /, "Mañ "),
    tone: due.tone,
  };
}

/** Absolute display: «6 oct, 09:23» (Europe/Paris, 24 h). */
export function formatAbsolute(iso: string): string {
  const p = partsInTz(iso);
  if (isDateOnly(iso)) return `${p.d} ${MONTHS[p.m - 1]}`;
  return `${p.d} ${MONTHS[p.m - 1]}, ${pad(p.hh)}:${pad(p.mm)}`;
}

/** Trigger display: «vie 9 oct 2026 · 09:00» or without time when date-only. */
export function formatDateTimeField(iso: string): string {
  const p = partsInTz(iso);
  const wd = DAYS[parisWeekday(new Date(iso))];
  const datePart = `${wd} ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
  if (isDateOnly(iso)) return datePart;
  return `${datePart} · ${pad(p.hh)}:${pad(p.mm)}`;
}

/** Long accessible name for a value. */
export function formatDateTimeAccessible(iso: string | null, empty: string): string {
  if (!iso) return empty;
  const p = partsInTz(iso);
  const longDays = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  const longMonths = [
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
  ];
  const wd = longDays[parisWeekday(new Date(iso))];
  const base = `${wd} ${p.d} de ${longMonths[p.m - 1]} de ${p.y}`;
  if (isDateOnly(iso)) return `${base}, sin hora`;
  return `${base}, ${pad(p.hh)}:${pad(p.mm)}`;
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
    return fromParisWall({
      y: year,
      m: month,
      d: day,
      hh: hour,
      mm: minute,
    }).toISOString();
  }
  const named = trimmed.match(
    /^(\d{1,2})\s+([a-záéíóú]{3})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})$/i,
  );
  if (named) {
    const mon = named[2]?.toLowerCase() ?? "";
    const month = MONTHS.indexOf(mon as (typeof MONTHS)[number]) + 1;
    if (month < 1) return null;
    return fromParisWall({
      y: Number(named[3]),
      m: month,
      d: Number(named[1]),
      hh: Number(named[4]),
      mm: Number(named[5]),
    }).toISOString();
  }
  return null;
}

export function wallParisToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  return fromParisWall({
    y: year,
    m: month,
    d: day,
    hh: hour,
    mm: minute,
  }).toISOString();
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const p = partsInTz(iso);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  if (isDateOnly(iso)) return "";
  const p = partsInTz(iso);
  return `${pad(p.hh)}:${pad(p.mm)}`;
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

export { addParisDays, isDateOnly };
