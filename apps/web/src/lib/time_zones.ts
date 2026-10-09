/** IANA zones always treated as valid, even when missing from supportedValuesOf. */
const ALWAYS_VALID_TIME_ZONES: readonly string[] = ["UTC", "Etc/UTC"];

/**
 * UTC-equivalent aliases (IANA / TZDB). Canonical form for comparison is "UTC".
 * Keep storing whatever the user picks; only comparisons/display decisions use this.
 */
const UTC_EQUIVALENT_ALIASES: readonly string[] = [
  "UTC",
  "Etc/UTC",
  "Etc/GMT",
  "GMT",
  "Etc/Zulu",
  "Zulu",
  "Etc/Universal",
  "Universal",
  "Etc/UCT",
  "UCT",
  "Etc/Greenwich",
  "Greenwich",
  "Etc/GMT+0",
  "Etc/GMT-0",
  "Etc/GMT0",
  // Chromium `timezoneId: "GMT"` / some engines surface offset forms:
  "+00:00",
  "+0000",
];

const UTC_EQUIVALENT_SET: ReadonlySet<string> = new Set(UTC_EQUIVALENT_ALIASES);

const FALLBACK_TIME_ZONES: readonly string[] = [
  "UTC",
  "Etc/UTC",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
];

function supportedTimeZones(): string[] | null {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    if (!supported) return null;
    return supported("timeZone");
  } catch {
    return null;
  }
}

function withAlwaysValid(zones: readonly string[]): string[] {
  const rest = zones.filter((z) => !ALWAYS_VALID_TIME_ZONES.includes(z));
  return [...ALWAYS_VALID_TIME_ZONES, ...rest];
}

/**
 * Map UTC-equivalent aliases to one canonical id before comparison/display decisions.
 * Non-UTC zones are returned unchanged (trimmed).
 */
export function canonicalizeTimeZone(zone: string): string {
  const trimmed = zone.trim();
  if (UTC_EQUIVALENT_SET.has(trimmed)) return "UTC";
  return trimmed;
}

/** True when two zone ids refer to the same zone (UTC aliases collapse). */
export function sameTimeZone(a: string, b: string): boolean {
  return canonicalizeTimeZone(a) === canonicalizeTimeZone(b);
}

/** Browser-resolved zone, defaulting to UTC. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True when Relay can persist and format with this IANA zone. */
export function isKnownTimeZone(zone: string): boolean {
  if (UTC_EQUIVALENT_SET.has(zone)) return true;
  if (ALWAYS_VALID_TIME_ZONES.includes(zone)) return true;
  const supported = supportedTimeZones();
  if (supported) return supported.includes(zone);
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Picker list: Intl zones plus UTC / Etc/UTC when the engine omits them. */
export function listTimeZones(): string[] {
  const supported = supportedTimeZones();
  if (supported && supported.length > 0) return withAlwaysValid(supported);
  return withAlwaysValid(FALLBACK_TIME_ZONES);
}

/** Exported for tests / docs — the alias list used by canonicalizeTimeZone. */
export function utcEquivalentAliases(): readonly string[] {
  return UTC_EQUIVALENT_ALIASES;
}
