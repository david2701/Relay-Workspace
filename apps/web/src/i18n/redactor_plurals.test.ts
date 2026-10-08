import { describe, expect, it } from "vitest";
import { translate } from "./translate";
import type { LocaleCode } from "./types";

const LOCALES: LocaleCode[] = ["en", "fr", "es"];

describe("Redactor ICU plurals (count) 0/1/2 × 3 langs", () => {
  it("notes.linkedCount", () => {
    expect(translate("en", "notes.linkedCount", { count: 0 })).toBe(
      "No linked items",
    );
    expect(translate("en", "notes.linkedCount", { count: 1 })).toBe(
      "1 linked item",
    );
    expect(translate("en", "notes.linkedCount", { count: 2 })).toBe(
      "2 linked items",
    );
    expect(translate("fr", "notes.linkedCount", { count: 0 })).toBe(
      "Aucun élément lié",
    );
    expect(translate("fr", "notes.linkedCount", { count: 1 })).toBe(
      "1 élément lié",
    );
    expect(translate("fr", "notes.linkedCount", { count: 2 })).toBe(
      "2 éléments liés",
    );
    expect(translate("es", "notes.linkedCount", { count: 0 })).toBe(
      "Sin ítems vinculados",
    );
    expect(translate("es", "notes.linkedCount", { count: 1 })).toBe(
      "1 ítem vinculado",
    );
    expect(translate("es", "notes.linkedCount", { count: 2 })).toBe(
      "2 ítems vinculados",
    );
  });

  it("search.resultsAnnounce with total", () => {
    for (const locale of LOCALES) {
      const zero = translate(locale, "search.resultsAnnounce", {
        count: 0,
        total: 23,
      });
      expect(zero.toLowerCase()).toMatch(/no|ningún|aucun/);
      const one = translate(locale, "search.resultsAnnounce", {
        count: 1,
        total: 23,
      });
      expect(one).toMatch(/1/);
      expect(one).toMatch(/23/);
      const two = translate(locale, "search.resultsAnnounce", {
        count: 2,
        total: 23,
      });
      expect(two).toMatch(/2/);
      expect(two).toMatch(/23/);
    }
    expect(
      translate("en", "search.resultsAnnounce", { count: 2, total: 23 }),
    ).toBe("2 results of 23");
    expect(
      translate("fr", "search.resultsAnnounce", { count: 0, total: 23 }),
    ).toBe("Aucun résultat");
    expect(
      translate("es", "search.resultsAnnounce", { count: 1, total: 23 }),
    ).toBe("1 resultado de 23");
  });

  it("facets.valueCount", () => {
    expect(translate("en", "facets.valueCount", { count: 0 })).toBe(
      "no results",
    );
    expect(translate("en", "facets.valueCount", { count: 1 })).toBe("1 result");
    expect(translate("en", "facets.valueCount", { count: 2 })).toBe(
      "2 results",
    );
    expect(translate("fr", "facets.valueCount", { count: 0 })).toBe(
      "aucun résultat",
    );
    expect(translate("es", "facets.valueCount", { count: 2 })).toBe(
      "2 resultados",
    );
  });

  it("nav.toggle.label", () => {
    expect(translate("en", "nav.toggle.label", { count: 0 })).toBe("Views");
    expect(translate("en", "nav.toggle.label", { count: 1 })).toBe(
      "Views, 1 needs you",
    );
    expect(translate("en", "nav.toggle.label", { count: 2 })).toBe(
      "Views, 2 need you",
    );
    expect(translate("fr", "nav.toggle.label", { count: 0 })).toBe("Vues");
    expect(translate("es", "nav.toggle.label", { count: 1 })).toBe(
      "Vistas, 1 te necesita",
    );
  });
});
