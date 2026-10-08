import { describe, expect, it } from "vitest";
import {
  formatParsePreview,
  parseNaturalDate,
} from "./date_parse";
import { isDateOnly } from "./paris_time";

/** Spec clock: jue 8 oct 2026, 09:19 CEST */
const NOW = new Date("2026-10-08T07:19:00.000Z");

describe("parseNaturalDate (V12-D4/D5/D7)", () => {
  it("parses mañana 9 and accent-insensitive manana 9", () => {
    const a = parseNaturalDate("mañana 9", { now: NOW, kind: "due" });
    const b = parseNaturalDate("manana 9", { now: NOW, kind: "due" });
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true });
    if (a.ok && b.ok) {
      expect(a.iso).toBe("2026-10-09T07:00:00.000Z");
      expect(b.iso).toBe(a.iso);
      expect(formatParsePreview(a.iso, a.dateOnly)).toBe(
        "vie, 9 oct 2026 · 09:00",
      );
    }
  });

  it("parses 15/10 14:30, +3d, jue, 3/1", () => {
    const d1 = parseNaturalDate("15/10 14:30", { now: NOW, kind: "due" });
    expect(d1).toMatchObject({ ok: true });
    if (d1.ok) {
      expect(formatParsePreview(d1.iso, d1.dateOnly)).toBe(
        "jue, 15 oct 2026 · 14:30",
      );
    }

    const d2 = parseNaturalDate("+3d", { now: NOW, kind: "due" });
    expect(d2).toMatchObject({ ok: true });
    if (d2.ok) {
      expect(d2.dateOnly).toBe(true);
      expect(formatParsePreview(d2.iso, d2.dateOnly)).toBe("dom, 11 oct 2026");
    }

    const d3 = parseNaturalDate("jue", { now: NOW, kind: "due" });
    expect(d3).toMatchObject({ ok: true });
    if (d3.ok) {
      expect(formatParsePreview(d3.iso, d3.dateOnly)).toBe("jue, 15 oct 2026");
    }

    const d4 = parseNaturalDate("3/1", { now: NOW, kind: "due" });
    expect(d4).toMatchObject({ ok: true });
    if (d4.ok) {
      expect(formatParsePreview(d4.iso, d4.dateOnly)).toBe("dom, 3 ene 2027");
    }
  });

  it("treats bare 15 as ambiguous", () => {
    const r = parseNaturalDate("15", { now: NOW, kind: "due" });
    expect(r).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("DST overlap and gap (V12-D7)", () => {
    const fall = parseNaturalDate("25/10 2:30", { now: NOW, kind: "due" });
    expect(fall).toMatchObject({ ok: true });
    if (fall.ok) {
      expect(fall.iso).toBe("2026-10-25T00:30:00.000Z");
      expect(fall.dst?.kind).toBe("overlap");
    }

    const spring = parseNaturalDate("28/3/2027 2:30", {
      now: NOW,
      kind: "due",
    });
    expect(spring).toMatchObject({ ok: true });
    if (spring.ok) {
      expect(spring.iso).toBe("2027-03-28T01:30:00.000Z");
      expect(spring.dst?.kind).toBe("gap");
      expect(spring.dst?.wall).toMatchObject({ hh: 3, mm: 30 });
    }
  });

  it("due without time is date-only 23:59 Paris", () => {
    const r = parseNaturalDate("hoy", { now: NOW, kind: "due" });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.dateOnly).toBe(true);
      expect(isDateOnly(r.iso)).toBe(true);
      expect(r.iso).toBe("2026-10-08T21:59:00.000Z");
    }
  });

  it("reminder without time defaults to 09:00", () => {
    const r = parseNaturalDate("mañana", { now: NOW, kind: "reminder" });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.dateOnly).toBe(false);
      expect(r.iso).toBe("2026-10-09T07:00:00.000Z");
    }
  });

  it("clears with sin fecha", () => {
    expect(parseNaturalDate("sin fecha", { now: NOW, kind: "due" })).toEqual({
      ok: false,
      reason: "empty",
    });
  });
});
