import { translate } from "../i18n/translate";
import type { LocaleCode, MessageKey } from "../i18n/types";
import { getDisplayContext } from "./display_context";
import {
  addZoneDays,
  fromZoneWall,
  isDateOnlyInZone,
  startOfZoneDay,
  toZoneParts,
  zoneDayDiff,
  zoneWeekday,
} from "./zone_time";

function tz(): string {
  return getDisplayContext().timezone;
}

function intlLocale(): string {
  return getDisplayContext().intlLocale;
}

function locale(): LocaleCode {
  return getDisplayContext().locale;
}

function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(locale(), key, vars ?? {});
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function partsInTz(iso: string) {
  return toZoneParts(new Date(iso), tz());
}

const dateFmt = () =>
  new Intl.DateTimeFormat(intlLocale(), {
    timeZone: tz(),
    day: "numeric",
    month: "short",
  });

const dateYearFmt = () =>
  new Intl.DateTimeFormat(intlLocale(), {
    timeZone: tz(),
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const weekdayTimeFmt = () =>
  new Intl.DateTimeFormat(intlLocale(), {
    timeZone: tz(),
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

const timeFmt = () =>
  new Intl.DateTimeFormat(intlLocale(), {
    timeZone: tz(),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

const longDateFmt = () =>
  new Intl.DateTimeFormat(intlLocale(), {
    timeZone: tz(),
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export function formatRelative(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t("relative.now");
  if (mins < 60) return t("relative.minutes", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("relative.hours", { n: hours });
  const hm = timeFmt().format(d);
  const today = startOfZoneDay(now, tz());
  const that = startOfZoneDay(d, tz());
  const dayDiff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (dayDiff === 1) return t("relative.yesterday", { time: hm });
  if (dayDiff < 7) return weekdayTimeFmt().format(d);
  const p = partsInTz(iso);
  const nowP = toZoneParts(now, tz());
  if (p.y === nowP.y) return dateFmt().format(d);
  return dateYearFmt().format(d);
}

function pastAgo(
  iso: string,
  now: Date,
  verbKey: "due.overdueVerb" | "due.remindedVerb",
): string {
  const d = new Date(iso);
  const verb = t(verbKey);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t("due.agoMoment", { verb });
  if (mins < 60) return t("due.agoMinutes", { verb, n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("due.agoHours", { verb, n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("due.agoDays", { verb, n: days });
  const dateStr = dateFmt().format(d);
  return t("due.agoDate", { verb, date: dateStr });
}

export function formatDue(
  iso: string,
  now = new Date(),
): {
  text: string;
  tone: "muted" | "warn" | "crit";
} {
  const d = new Date(iso);
  const dateOnly = isDateOnlyInZone(iso, tz());
  const hm = timeFmt().format(d);
  const dayDiff = zoneDayDiff(iso, tz(), now);

  if (d.getTime() < now.getTime()) {
    return { text: pastAgo(iso, now, "due.overdueVerb"), tone: "crit" };
  }
  if (dayDiff === 0) {
    const hoursLeft = (d.getTime() - now.getTime()) / 3_600_000;
    return {
      text: dateOnly ? t("due.today") : t("due.todayAt", { time: hm }),
      tone: hoursLeft < 4 && !dateOnly ? "warn" : "muted",
    };
  }
  if (dayDiff === 1) {
    return {
      text: dateOnly ? t("due.tomorrow") : t("due.tomorrowAt", { time: hm }),
      tone: "muted",
    };
  }
  if (dayDiff < 7) {
    const wd = new Intl.DateTimeFormat(intlLocale(), {
      timeZone: tz(),
      weekday: "short",
    }).format(d);
    return {
      text: dateOnly ? wd : `${wd} ${hm}`,
      tone: "muted",
    };
  }
  const datePart = dateFmt().format(d);
  return {
    text: dateOnly ? datePart : `${datePart} ${hm}`,
    tone: "muted",
  };
}

export function formatDueForGroup(
  iso: string,
  groupKey: string,
  now = new Date(),
): { text: string; tone: "muted" | "warn" | "crit" } {
  const dateOnly = isDateOnlyInZone(iso, tz());
  const hm = timeFmt().format(new Date(iso));
  const d = new Date(iso);

  if (groupKey === "overdue") {
    return { text: pastAgo(iso, now, "due.overdueVerb"), tone: "crit" };
  }
  if (groupKey === "today" || groupKey === "tomorrow") {
    return { text: dateOnly ? "" : hm, tone: "muted" };
  }
  if (groupKey === "week") {
    const wd = new Intl.DateTimeFormat(intlLocale(), {
      timeZone: tz(),
      weekday: "short",
    }).format(d);
    return {
      text: dateOnly ? wd : `${wd} ${hm}`,
      tone: "muted",
    };
  }
  if (groupKey === "later") {
    return { text: dateFmt().format(d), tone: "muted" };
  }
  return formatDue(iso, now);
}

export function formatReminder(
  iso: string,
  now = new Date(),
): { text: string; tone: "muted" | "warn" | "crit" } {
  const d = new Date(iso);
  if (d.getTime() < now.getTime()) {
    return { text: pastAgo(iso, now, "due.remindedVerb"), tone: "muted" };
  }
  const due = formatDue(iso, now);
  const todayPrefix = `${t("due.today")} `;
  const tomorrowPrefix = `${t("due.tomorrow")} `;
  return {
    text: due.text
      .replace(todayPrefix, "")
      .replace(tomorrowPrefix, `${t("due.tomorrow").slice(0, 4)} `),
    tone: due.tone,
  };
}

export function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (isDateOnlyInZone(iso, tz())) return dateFmt().format(d);
  const datePart = dateFmt().format(d);
  return `${datePart}, ${timeFmt().format(d)}`;
}

export function formatDateTimeField(iso: string): string {
  const d = new Date(iso);
  const datePart = dateYearFmt().format(d);
  if (isDateOnlyInZone(iso, tz())) return datePart;
  return `${datePart} · ${timeFmt().format(d)}`;
}

export function formatDateTimeAccessible(
  iso: string | null,
  empty: string,
): string {
  if (!iso) return empty;
  const d = new Date(iso);
  const base = longDateFmt().format(d);
  if (isDateOnlyInZone(iso, tz())) return `${base}, ${t("picker.noTime")}`;
  return `${base}, ${timeFmt().format(d)}`;
}

export function parseDateTimeField(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timeZone = tz();
  const slash = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/,
  );
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    const hour = Number(slash[4] ?? "0");
    const minute = Number(slash[5] ?? "0");
    return fromZoneWall(
      { y: year, m: month, d: day, hh: hour, mm: minute },
      timeZone,
    ).toISOString();
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
  return fromZoneWall(
    { y: year, m: month, d: day, hh: hour, mm: minute },
    tz(),
  ).toISOString();
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const p = partsInTz(iso);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  if (isDateOnlyInZone(iso, tz())) return "";
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

export function isDateOnly(iso: string): boolean {
  return isDateOnlyInZone(iso, tz());
}

export function addParisDays(date: Date, days: number): Date {
  return addZoneDays(date, days, tz());
}

/** @deprecated use getDisplayContext().timezone */
export const DISPLAY_TZ = "Europe/Paris";
