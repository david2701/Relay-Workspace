import { describe, expect, it } from "vitest";
import { formatDateTimeField, formatReminder } from "./format";

const NOW = new Date("2026-10-08T07:19:00.000Z");

describe("formatReminder", () => {
  it("uses Avisó hace… for past reminders, not Venció", () => {
    const r = formatReminder("2026-10-08T05:19:00.000Z", NOW);
    expect(r.text).toMatch(/^Avisó hace/);
    expect(r.text).not.toMatch(/Venció/);
  });
});

describe("formatDateTimeField date-only", () => {
  it("hides 23:59 Paris wall time", () => {
    const text = formatDateTimeField("2026-10-08T21:59:00.000Z");
    expect(text).toBe("jue, 8 oct 2026");
    expect(text).not.toMatch(/23:59/);
  });
});
