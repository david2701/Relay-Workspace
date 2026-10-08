import { beforeEach, describe, expect, it } from "vitest";
import {
  resetDisplayContextForTests,
  setDisplayContext,
} from "./display_context";
import { formatDateTimeField, formatDue, formatReminder } from "./format";

const NOW = new Date("2026-10-08T08:00:00.000Z"); // Thu 8 Oct 10:00 Paris

beforeEach(() => {
  resetDisplayContextForTests();
  setDisplayContext({
    timezone: "Europe/Paris",
    locale: "es",
    intlLocale: "es-ES",
  });
});

describe("formatReminder (§1.15 keeps day)", () => {
  it("uses Avisó … for past reminders, not Venció", () => {
    const r = formatReminder("2026-10-08T06:00:00.000Z", NOW);
    expect(r.text).toMatch(/^Avisó/);
    expect(r.text).not.toMatch(/Venció/);
    expect(r.tone).toBe("muted");
  });

  it("keeps Hoy on same-day future reminder (no bare time)", () => {
    const r = formatReminder("2026-10-08T21:12:00.000Z", NOW);
    expect(r.text).toMatch(/^Hoy /);
    expect(r.text).toMatch(/23:12/);
    expect(r.tone).toBe("muted");
  });

  it("V03-L29 pair: due tomorrow + reminder today both show day", () => {
    const due = formatDue("2026-10-09T11:12:00.000Z", NOW);
    const rem = formatReminder("2026-10-08T21:12:00.000Z", NOW);
    expect(due.text).toBe("Mañana 13:12");
    expect(rem.text).toBe("Hoy 23:12");
  });
});

describe("formatDateTimeField date-only", () => {
  it("hides 23:59 Paris wall time", () => {
    const text = formatDateTimeField("2026-10-08T21:59:00.000Z");
    expect(text).toMatch(/8 oct 2026/);
    expect(text).not.toMatch(/23:59/);
  });
});
