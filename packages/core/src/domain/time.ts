export function nowIso(date: Date = new Date()): string {
  return date.toISOString();
}

export function parseIso(value: string): Date {
  return new Date(value);
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export const THRESHOLDS = {
  staleHours: 24,
  needsYouSuggestHours: 2,
  reminderSoonHours: 2,
  dueSoonHours: 24,
} as const;
