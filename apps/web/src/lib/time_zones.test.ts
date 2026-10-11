import { describe, expect, it } from "vitest";
import {
  canonicalizeTimeZone,
  isKnownTimeZone,
  listTimeZones,
  sameTimeZone,
  utcEquivalentAliases,
} from "./time_zones";

describe("time_zones", () => {
  it("treats UTC and Etc/UTC as known", () => {
    expect(isKnownTimeZone("UTC")).toBe(true);
    expect(isKnownTimeZone("Etc/UTC")).toBe(true);
  });

  it("includes UTC and Etc/UTC at the front of the picker list", () => {
    const zones = listTimeZones();
    expect(zones[0]).toBe("UTC");
    expect(zones[1]).toBe("Etc/UTC");
  });

  it("canonicalizes UTC-equivalent aliases to UTC", () => {
    for (const alias of utcEquivalentAliases()) {
      expect(canonicalizeTimeZone(alias)).toBe("UTC");
    }
    expect(canonicalizeTimeZone("  Etc/UTC  ")).toBe("UTC");
  });

  it("leaves non-UTC zones unchanged", () => {
    expect(canonicalizeTimeZone("Europe/Paris")).toBe("Europe/Paris");
    expect(canonicalizeTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("sameTimeZone treats UTC aliases as equal", () => {
    expect(sameTimeZone("UTC", "Etc/UTC")).toBe(true);
    expect(sameTimeZone("Etc/UTC", "GMT")).toBe(true);
    expect(sameTimeZone("Etc/GMT+0", "Etc/GMT-0")).toBe(true);
    expect(sameTimeZone("Zulu", "Etc/Universal")).toBe(true);
    expect(sameTimeZone("UTC", "Europe/Paris")).toBe(false);
    expect(sameTimeZone("Europe/Paris", "Etc/UTC")).toBe(false);
  });

  it("treats +00:00 and +0000 as UTC aliases", () => {
    expect(canonicalizeTimeZone("+00:00")).toBe("UTC");
    expect(canonicalizeTimeZone("+0000")).toBe("UTC");
    expect(sameTimeZone("+00:00", "UTC")).toBe(true);
    expect(sameTimeZone("+0000", "Etc/UTC")).toBe(true);
    expect(sameTimeZone("+00:00", "GMT")).toBe(true);
    expect(isKnownTimeZone("+00:00")).toBe(true);
    expect(isKnownTimeZone("+0000")).toBe(true);
  });
});
