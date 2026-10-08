import { describe, expect, it } from "vitest";
import type { LocaleCode } from "../i18n/types";
import { parseNaturalDate } from "./date_parse";
import { PHRASE_TEST_ROWS } from "./date_parse_phrases";
import {
  resetDisplayContextForTests,
  setDisplayContext,
} from "./display_context";
import { startOfZoneDay, zoneDayDiff } from "./zone_time";

const NOW = new Date("2026-10-08T07:19:00.000Z");
const TZ = "Europe/Paris";

const LOCALES: LocaleCode[] = ["es", "en", "fr"];

function intlFor(locale: LocaleCode): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-US";
}

describe("parseNaturalDate v1.2 phrase table × locales", () => {
  for (const row of PHRASE_TEST_ROWS) {
    for (const locale of LOCALES) {
      const text = row[locale];
      it(`${locale}: ${row.id} — ${text}`, () => {
        resetDisplayContextForTests();
        setDisplayContext({
          timezone: TZ,
          locale,
          intlLocale: intlFor(locale),
        });
        const r = parseNaturalDate(text, {
          now: NOW,
          kind: row.kind,
          locale,
          timezone: TZ,
        });
        if (row.id === "no_date" || row.id === "no_reminder") {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.reason).toBe("empty");
          return;
        }
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const iso = r.iso;
        if (row.id === "today") {
          expect(zoneDayDiff(iso, TZ, NOW)).toBe(0);
        }
        if (row.id === "tomorrow") {
          expect(zoneDayDiff(iso, TZ, NOW)).toBe(1);
        }
        if (row.id === "day_after") {
          expect(zoneDayDiff(iso, TZ, NOW)).toBe(2);
        }
        if (row.id === "friday") {
          const start = startOfZoneDay(new Date(iso), TZ);
          expect(start.getTime()).toBeGreaterThan(NOW.getTime());
        }
      });
    }
  }
});
