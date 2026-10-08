import { describe, expect, it } from "vitest";
import {
  dateOnlyParisIso,
  fromParisWall,
  isDateOnlyParis,
  toParisParts,
} from "../src/domain/paris_time.js";

describe("paris_time DST rules", () => {
  it("spring gap 2027-03-28: 02:30 advances to 03:30 CEST", () => {
    const d = fromParisWall({ y: 2027, m: 3, d: 28, hh: 2, mm: 30 });
    const p = toParisParts(d);
    expect(p).toMatchObject({ y: 2027, m: 3, d: 28, hh: 3, mm: 30 });
    expect(d.toISOString()).toBe("2027-03-28T01:30:00.000Z");
  });

  it("fall overlap 2026-10-25: 02:30 takes first occurrence (CEST)", () => {
    const d = fromParisWall({ y: 2026, m: 10, d: 25, hh: 2, mm: 30 });
    expect(d.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    const p = toParisParts(d);
    expect(p).toMatchObject({ y: 2026, m: 10, d: 25, hh: 2, mm: 30 });
  });

  it("date-only convention is 23:59 Paris wall time", () => {
    const iso = dateOnlyParisIso(2026, 10, 8);
    expect(isDateOnlyParis(iso)).toBe(true);
    const p = toParisParts(new Date(iso));
    expect(p).toMatchObject({ y: 2026, m: 10, d: 8, hh: 23, mm: 59 });
  });

  it("ordinary CEST wall time round-trips", () => {
    const d = fromParisWall({ y: 2026, m: 10, d: 8, hh: 9, mm: 19 });
    expect(d.toISOString()).toBe("2026-10-08T07:19:00.000Z");
    expect(toParisParts(d)).toMatchObject({
      y: 2026,
      m: 10,
      d: 8,
      hh: 9,
      mm: 19,
    });
  });
});
