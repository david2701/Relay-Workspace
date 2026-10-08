import { describe, expect, it } from "vitest";
import {
  resolveFormatLocale,
  WEEK_START_DAY,
} from "./format_locale";

describe("PR5 resolveFormatLocale", () => {
  it("uses browser region when language matches UI", () => {
    expect(resolveFormatLocale("fr", ["fr-CA", "en"])).toBe("fr-CA");
    expect(resolveFormatLocale("en", ["en-GB"])).toBe("en-GB");
    expect(resolveFormatLocale("es", ["es-MX", "en"])).toBe("es-MX");
  });

  it("falls back to en-US / fr-FR / es-ES when region language differs", () => {
    expect(resolveFormatLocale("fr", ["de-DE", "en-US"])).toBe("fr-FR");
    expect(resolveFormatLocale("en", ["fr-FR"])).toBe("en-US");
    expect(resolveFormatLocale("es", ["pt-BR"])).toBe("es-ES");
  });

  it("uses fallback when browser language matches but has no region", () => {
    expect(resolveFormatLocale("fr", ["fr"])).toBe("fr-FR");
  });

  it("week starts Monday in v0.3", () => {
    expect(WEEK_START_DAY).toBe(1);
  });
});
