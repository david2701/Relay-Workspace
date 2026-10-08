/**
 * Wall-clock helpers. Day boundaries belong in {@link ./zone_time.js} with an
 * explicit IANA timezone (Relay settings); Paris wrappers are test-only.
 */
import {
  addParisDays,
  endOfParisDay,
  startOfParisDay,
} from "./paris_time.js";

export function nowIso(date: Date = new Date()): string {
  return date.toISOString();
}

export function parseIso(value: string): Date {
  return new Date(value);
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

/** @deprecated Use startOfParisDay — local setHours is not Europe/Paris-safe. */
export function startOfLocalDay(date: Date): Date {
  return startOfParisDay(date);
}

/** @deprecated Use endOfParisDay — local setHours is not Europe/Paris-safe. */
export function endOfLocalDay(date: Date): Date {
  return endOfParisDay(date);
}

/** @deprecated Use addParisDays for calendar-day math in Europe/Paris. */
export function addDays(date: Date, days: number): Date {
  return addParisDays(date, days);
}

export const THRESHOLDS = {
  staleHours: 24,
  needsYouSuggestHours: 2,
  reminderSoonHours: 2,
  dueSoonHours: 24,
} as const;
