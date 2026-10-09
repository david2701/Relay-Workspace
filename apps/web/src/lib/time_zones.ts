/** IANA zones always treated as valid, even when missing from supportedValuesOf. */
const ALWAYS_VALID_TIME_ZONES: readonly string[] = ["UTC", "Etc/UTC"];

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
