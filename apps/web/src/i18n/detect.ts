import {
  DEFAULT_LOCALE,
  type LocaleCode,
  SUPPORTED_LOCALES,
} from "./types";

const STORAGE_KEY = "relay.locale";

export function isLocaleCode(value: string): value is LocaleCode {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Map BCP-47 tags (navigator.languages) → supported locale; else English. */
export function detectLocale(
  languages: readonly string[] = typeof navigator !== "undefined"
    ? navigator.languages
    : ["en"],
): LocaleCode {
  for (const raw of languages) {
    const tag = raw.toLowerCase();
    const base = tag.split("-")[0] ?? tag;
    if (isLocaleCode(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function readStoredLocale(): LocaleCode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && isLocaleCode(v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function storeLocale(locale: LocaleCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function resolveInitialLocale(): LocaleCode {
  return readStoredLocale() ?? detectLocale();
}
