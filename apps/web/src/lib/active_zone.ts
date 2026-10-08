/** Wall-clock helpers using the active settings timezone (display_context). */

import { getDisplayContext } from "./display_context";
import {
  addZoneDays,
  dateOnlyZoneIso,
  fromZoneWall,
  fromZoneWallDetailed,
  isDateOnlyInZone,
  startOfZoneDay,
  toZoneParts,
  type DstNote,
  type FromZoneWallResult,
  type ZoneWall,
  zoneWeekday,
} from "./zone_time";

export type { DstNote, FromZoneWallResult };
export type ActiveWall = ZoneWall;

function tz(): string {
  return getDisplayContext().timezone;
}

export function activeTimezone(): string {
  return tz();
}

export function toActiveParts(date: Date): ZoneWall & { ss: number } {
  return toZoneParts(date, tz());
}

export function fromActiveWallDetailed(wall: ZoneWall): FromZoneWallResult {
  return fromZoneWallDetailed(wall, tz());
}

export function fromActiveWall(wall: ZoneWall): Date {
  return fromZoneWall(wall, tz());
}

export function startOfActiveDay(date: Date): Date {
  return startOfZoneDay(date, tz());
}

export function addActiveDays(date: Date, days: number): Date {
  return addZoneDays(date, days, tz());
}

export function isDateOnly(iso: string): boolean {
  return isDateOnlyInZone(iso, tz());
}

export function dateOnlyActiveIso(y: number, m: number, d: number): string {
  return dateOnlyZoneIso(y, m, d, tz());
}

export function activeWeekday(date: Date): number {
  return zoneWeekday(date, tz());
}

/** Short label for TZ hints (e.g. Europe/Paris → Paris). */
export function activeTimezoneLabel(): string {
  const id = tz();
  const tail = id.split("/").pop() ?? id;
  return tail.replace(/_/g, " ");
}
