/**
 * Europe/Paris wrappers around {@link ./zone_time.js} for tests and transitional
 * call sites. Production day boundaries use the configured timezone via zone_*.
 */
import {
  addZoneDays,
  dateOnlyZoneIso,
  endOfZoneDay,
  endOfZoneWeek,
  fromZoneWall,
  fromZoneWallDetailed,
  isDateOnlyInZone,
  startOfZoneDay,
  startOfZoneWeek,
  toZoneParts,
  zoneDayDiff,
  zoneWeekday,
  type DstNote,
  type FromZoneWallResult,
  type ZoneWall,
} from "./zone_time.js";

export const PARIS_TZ = "Europe/Paris";

export type ParisWall = ZoneWall;
export type { DstNote, FromZoneWallResult };

export function toParisParts(date: Date): ZoneWall & { ss: number } {
  return toZoneParts(date, PARIS_TZ);
}

export function fromParisWall(wall: ParisWall): Date {
  return fromZoneWall(wall, PARIS_TZ);
}

export function fromParisWallDetailed(wall: ParisWall): FromZoneWallResult {
  return fromZoneWallDetailed(wall, PARIS_TZ);
}

export function startOfParisDay(date: Date): Date {
  return startOfZoneDay(date, PARIS_TZ);
}

export function endOfParisDay(date: Date): Date {
  return endOfZoneDay(date, PARIS_TZ);
}

export function addParisDays(date: Date, days: number): Date {
  return addZoneDays(date, days, PARIS_TZ);
}

export function isDateOnlyParis(iso: string): boolean {
  return isDateOnlyInZone(iso, PARIS_TZ);
}

/** @deprecated Prefer isDateOnlyInZone(iso, timeZone). */
export function isDateOnly(iso: string): boolean {
  return isDateOnlyParis(iso);
}

export function dateOnlyParisIso(y: number, m: number, d: number): string {
  return dateOnlyZoneIso(y, m, d, PARIS_TZ);
}

export function parisWeekday(date: Date): number {
  return zoneWeekday(date, PARIS_TZ);
}

export function startOfParisWeek(date: Date): Date {
  return startOfZoneWeek(date, PARIS_TZ);
}

export function endOfParisWeek(date: Date): Date {
  return endOfZoneWeek(date, PARIS_TZ);
}

export function parisDayDiff(
  isoOrDate: string | Date,
  now = new Date(),
): number {
  return zoneDayDiff(isoOrDate, PARIS_TZ, now);
}
