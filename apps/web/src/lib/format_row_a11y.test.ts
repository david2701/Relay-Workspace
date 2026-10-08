import { describe, expect, it } from "vitest";
import { translate } from "../i18n/translate";
import type { LocaleCode } from "../i18n/types";
import {
  resetDisplayContextForTests,
  setDisplayContext,
} from "./display_context";
import { formatRowAccessibleDate } from "./format";

/** Thu 8 Oct 2026, 10:00 Europe/Paris */
const NOW = new Date("2026-10-08T08:00:00.000Z");
const TZ = "Europe/Paris";

function setLocale(locale: LocaleCode, intl: string) {
  resetDisplayContextForTests();
  setDisplayContext({ timezone: TZ, locale, intlLocale: intl });
}

describe("formatRowAccessibleDate (§1.15 lowercase ES/FR)", () => {
  it("ES: hoy/mañana lowercase; weekday lowercase", () => {
    setLocale("es", "es-ES");
    expect(formatRowAccessibleDate("2026-10-08T21:12:00.000Z", NOW)).toBe(
      "hoy, 23:12",
    );
    expect(formatRowAccessibleDate("2026-10-09T11:12:00.000Z", NOW)).toBe(
      "mañana, 13:12",
    );
    // Sat 10 Oct 09:00 — dayDiff 2 → long weekday lowercased
    expect(formatRowAccessibleDate("2026-10-10T07:00:00.000Z", NOW)).toBe(
      "sábado, 09:00",
    );
  });

  it("FR: aujourd’hui/demain lowercase; weekday lowercase", () => {
    setLocale("fr", "fr-FR");
    expect(formatRowAccessibleDate("2026-10-08T21:12:00.000Z", NOW)).toBe(
      "aujourd’hui, 23:12",
    );
    expect(formatRowAccessibleDate("2026-10-09T11:12:00.000Z", NOW)).toBe(
      "demain, 13:12",
    );
    expect(formatRowAccessibleDate("2026-10-10T07:00:00.000Z", NOW)).toBe(
      "samedi, 09:00",
    );
  });

  it("EN: today/tomorrow from RTF; weekday keeps Intl capital", () => {
    setLocale("en", "en-US");
    expect(formatRowAccessibleDate("2026-10-08T21:12:00.000Z", NOW)).toBe(
      "today, 23:12",
    );
    expect(formatRowAccessibleDate("2026-10-09T11:12:00.000Z", NOW)).toBe(
      "tomorrow, 13:12",
    );
    expect(formatRowAccessibleDate("2026-10-10T07:00:00.000Z", NOW)).toMatch(
      /^Saturday/,
    );
  });

  it("row.due.label / row.reminder.label paste Redactor casing", () => {
    setLocale("es", "es-ES");
    const date = formatRowAccessibleDate("2026-10-08T21:12:00.000Z", NOW);
    expect(translate("es", "row.due.label", { date })).toBe(
      "Vence: hoy, 23:12",
    );
    expect(translate("es", "row.reminder.label", { date })).toBe(
      "Aviso: hoy, 23:12",
    );
    setLocale("fr", "fr-FR");
    const frDate = formatRowAccessibleDate("2026-10-08T21:12:00.000Z", NOW);
    expect(translate("fr", "row.reminder.label", { date: frDate })).toBe(
      "Rappel : aujourd’hui, 23:12",
    );
    setLocale("en", "en-US");
    const enDate = formatRowAccessibleDate("2026-10-08T21:12:00.000Z", NOW);
    expect(translate("en", "row.due.label", { date: enDate })).toBe(
      "Due today, 23:12",
    );
  });
});
