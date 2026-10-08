import { describe, expect, it } from "vitest";
import type { LocaleCode } from "../i18n/types";
import {
  resetDisplayContextForTests,
  setDisplayContext,
} from "./display_context";
import { parseNaturalDate } from "./date_parse";
import { toZoneParts } from "./zone_time";

const NOW = new Date("2026-10-08T07:19:00.000Z");
const TZ = "Europe/Paris";

const EXAMPLES: Array<{ locale: LocaleCode; text: string; check: string }> = [
  { locale: "es", text: "mañana 9", check: "tomorrow_9" },
  { locale: "es", text: "vie 14:30", check: "fri_1430" },
  { locale: "es", text: "15 oct", check: "oct_15_dateonly" },
  { locale: "en", text: "tomorrow 9", check: "tomorrow_9" },
  { locale: "en", text: "fri 14:30", check: "fri_1430" },
  { locale: "en", text: "oct 15", check: "oct_15_dateonly" },
  { locale: "fr", text: "demain 9", check: "tomorrow_9" },
  { locale: "fr", text: "ven 14:30", check: "fri_1430" },
  { locale: "fr", text: "15 oct", check: "oct_15_dateonly" },
];

function intlFor(locale: LocaleCode): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-US";
}

describe("AC3-L8 Redactor picker examples (9 phrases)", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.locale}: «${ex.text}»`, () => {
      resetDisplayContextForTests();
      setDisplayContext({
        timezone: TZ,
        locale: ex.locale,
        intlLocale: intlFor(ex.locale),
      });
      const r = parseNaturalDate(ex.text, {
        now: NOW,
        kind: "due",
        locale: ex.locale,
        timezone: TZ,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const p = toZoneParts(new Date(r.iso), TZ);
      if (ex.check === "tomorrow_9") {
        expect(p.hh).toBe(9);
        expect(p.mm).toBe(0);
        // 9 Oct 2026 is Thursday in Paris; tomorrow = 9th... NOW is 8 Oct 09:19 Paris → tomorrow 9 Oct
        expect(p.d).toBe(9);
        expect(p.m).toBe(10);
      }
      if (ex.check === "fri_1430") {
        expect(p.hh).toBe(14);
        expect(p.mm).toBe(30);
        // next Friday after Thu 8 Oct 2026 = 9 Oct
        expect(p.d).toBe(9);
      }
      if (ex.check === "oct_15_dateonly") {
        expect(r.dateOnly).toBe(true);
        expect(p.m).toBe(10);
        expect(p.d).toBe(15);
        expect(p.hh).toBe(23);
        expect(p.mm).toBe(59);
      }
    });
  }
});
