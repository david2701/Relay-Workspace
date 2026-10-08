import type en from "./locales/en.json";

/** Keys are derived from the English source-of-truth locale file. */
export type MessageKey = keyof typeof en;

export type LocaleCode = "en" | "fr" | "es";

export const SUPPORTED_LOCALES: readonly LocaleCode[] = ["en", "fr", "es"];

export const DEFAULT_LOCALE: LocaleCode = "en";

export type MessageDict = Record<MessageKey, string>;
