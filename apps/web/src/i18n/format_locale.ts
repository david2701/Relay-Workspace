import type { LocaleCode } from "./types";

const FALLBACK: Record<LocaleCode, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
};

/**
 * PR5 — formatting locale from the browser region when its language matches
 * the UI language (e.g. UI `fr` + `fr-CA` → `fr-CA`); otherwise en-US / fr-FR / es-ES.
 */
export function resolveFormatLocale(
  uiLocale: LocaleCode,
  languages: readonly string[] = typeof navigator !== "undefined"
    ? navigator.languages
    : [FALLBACK[uiLocale]],
): string {
  for (const raw of languages) {
    const tag = raw.trim();
    if (!tag) continue;
    const base = tag.split("-")[0]?.toLowerCase() ?? "";
    if (base === uiLocale) {
      // Prefer a region-qualified tag when the browser provides one.
      if (tag.includes("-")) return normalizeBcp47(tag);
      return FALLBACK[uiLocale];
    }
  }
  return FALLBACK[uiLocale];
}

function normalizeBcp47(tag: string): string {
  const parts = tag.split("-");
  const language = (parts[0] ?? "en").toLowerCase();
  const rest = parts.slice(1).map((p, i) => {
    if (p.length === 2 && i === 0) return p.toUpperCase();
    if (p.length === 4) return p[0]!.toUpperCase() + p.slice(1).toLowerCase();
    return p;
  });
  return [language, ...rest].join("-");
}

/** Human-readable region label for Settings («Fechas y números: …»). */
export function formatLocaleDisplayName(
  formatLocale: string,
  uiLocale: LocaleCode,
): string {
  try {
    const dn = new Intl.DisplayNames([FALLBACK[uiLocale]], { type: "language" });
    return dn.of(formatLocale) ?? formatLocale;
  } catch {
    return formatLocale;
  }
}

/** Week starts Monday in v0.3 for all locales (brief S5 / ui-spec §1.6). */
export const WEEK_START_DAY = 1 as const;
