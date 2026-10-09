import { describe, expect, it } from "vitest";
import { isKnownTimeZone, listTimeZones } from "./time_zones";

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
});
